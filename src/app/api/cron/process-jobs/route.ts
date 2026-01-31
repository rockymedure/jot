import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processReflectionJob, ReflectionJob, RepoWithProfile } from '@/lib/reflection-processor'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

// How long to keep processing jobs before stopping (leave buffer for cleanup)
const PROCESSING_TIMEOUT_MS = 4 * 60 * 1000 // 4 minutes

// How long before a "processing" job is considered stale and can be reclaimed
const STALE_JOB_MINUTES = 10

/**
 * Worker: Processes pending reflection jobs from the queue.
 * Runs every 2 minutes via Supabase pg_cron.
 * 
 * Uses SELECT FOR UPDATE SKIP LOCKED to safely handle concurrent workers.
 * Each invocation processes jobs until timeout approaches.
 * 
 * Also recovers stale jobs (stuck in "processing" for too long).
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (process.env.NODE_ENV === 'production' && !cronSecret) {
    console.error('[worker] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const startTime = Date.now()

  const results = {
    processed: 0,
    failed: 0,
    recovered: 0
  }

  try {
    // First, recover stale jobs (stuck in "processing" for too long)
    const staleThreshold = new Date(Date.now() - STALE_JOB_MINUTES * 60 * 1000).toISOString()
    
    const { data: staleJobs, error: staleError } = await supabase
      .from('reflection_jobs')
      .update({ 
        status: 'pending',
        started_at: null
      })
      .eq('status', 'processing')
      .lt('started_at', staleThreshold)
      .select('id')

    if (staleError) {
      console.error('[worker] Error recovering stale jobs:', staleError)
    } else if (staleJobs && staleJobs.length > 0) {
      results.recovered = staleJobs.length
      console.log(`[worker] Recovered ${staleJobs.length} stale jobs`)
    }

    // Process jobs until timeout approaches
    while (Date.now() - startTime < PROCESSING_TIMEOUT_MS) {
      // Claim a pending job using raw SQL for SKIP LOCKED
      // This allows multiple workers to run concurrently without conflicts
      const { data: claimedJobs, error: claimError } = await supabase
        .rpc('claim_reflection_job')

      if (claimError) {
        console.error('[worker] Error claiming job:', claimError)
        break
      }

      // If no jobs available, we're done
      if (!claimedJobs || claimedJobs.length === 0) {
        console.log('[worker] No pending jobs available')
        break
      }

      const job = claimedJobs[0] as ReflectionJob

      console.log(`[worker] Claimed job ${job.id} for repo ${job.repo_id}`)

      // Fetch the repo with profile info
      const { data: repo, error: repoError } = await supabase
        .from('repos')
        .select(`
          id,
          name,
          full_name,
          user_id,
          last_push_at,
          webhook_id,
          profiles!inner(
            id,
            email,
            name,
            github_access_token,
            timezone
          )
        `)
        .eq('id', job.repo_id)
        .single()

      if (repoError || !repo) {
        console.error(`[worker] Failed to fetch repo ${job.repo_id}:`, repoError)
        
        // Mark job as failed
        await supabase
          .from('reflection_jobs')
          .update({
            status: 'failed',
            last_error: 'Repo not found or inaccessible',
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id)
        
        results.failed++
        continue
      }

      // Process the reflection
      const result = await processReflectionJob(job, repo as unknown as RepoWithProfile)

      if (result.success) {
        // Mark job as completed
        await supabase
          .from('reflection_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id)

        console.log(`[worker] Job ${job.id} completed successfully`)
        results.processed++
      } else {
        // Check if we should retry or mark as failed
        const newAttempts = job.attempts + 1
        const maxAttempts = 3

        if (newAttempts >= maxAttempts) {
          // Max attempts reached - mark as permanently failed
          await supabase
            .from('reflection_jobs')
            .update({
              status: 'failed',
              last_error: result.error || 'Unknown error',
              completed_at: new Date().toISOString()
            })
            .eq('id', job.id)

          console.log(`[worker] Job ${job.id} failed permanently after ${newAttempts} attempts: ${result.error}`)
        } else {
          // Reset to pending for retry
          await supabase
            .from('reflection_jobs')
            .update({
              status: 'pending',
              started_at: null,
              last_error: result.error || 'Unknown error'
            })
            .eq('id', job.id)

          console.log(`[worker] Job ${job.id} failed, will retry (attempt ${newAttempts}/${maxAttempts}): ${result.error}`)
        }

        results.failed++
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`[worker] Complete in ${elapsed}ms: ${results.processed} processed, ${results.failed} failed, ${results.recovered} recovered`)

    return NextResponse.json({
      success: true,
      ...results,
      elapsedMs: elapsed
    })

  } catch (error) {
    console.error('[worker] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
