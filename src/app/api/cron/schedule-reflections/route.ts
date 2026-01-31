import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { formatInTimeZone } from 'date-fns-tz'

export const runtime = 'nodejs'
export const maxDuration = 30 // Fast - just creates jobs

// How long after last push to wait before generating reflection
const INACTIVITY_HOURS = 1

/**
 * Scheduler: Creates pending jobs for repos that need reflections.
 * Runs every 15 minutes via Supabase pg_cron.
 * 
 * This is FAST - it only checks eligibility and creates jobs.
 * The actual processing is done by the worker endpoint.
 * 
 * Eligibility checks:
 * - Subscription active (or trial not expired)
 * - In reflection window (9 PM - 5 AM user timezone)
 * - Not actively coding (1h inactivity since last push)
 * - No existing reflection for work_date
 * - No pending/processing job already exists
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (process.env.NODE_ENV === 'production' && !cronSecret) {
    console.error('[scheduler] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()

  try {
    // Get all active repos with their user's profile
    const { data: repos, error: reposError } = await supabase
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
          github_access_token,
          subscription_status,
          trial_ends_at,
          timezone
        )
      `)
      .eq('is_active', true)

    if (reposError) {
      console.error('[scheduler] Error fetching repos:', reposError)
      return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 })
    }

    console.log(`[scheduler] Checking ${repos?.length || 0} active repos`)

    const results = {
      jobsCreated: 0,
      skipped: 0,
      alreadyQueued: 0
    }

    for (const repo of repos || []) {
      const profile = repo.profiles as unknown as {
        id: string
        email: string
        github_access_token: string
        subscription_status: string
        trial_ends_at: string
        timezone: string
      }

      // Check subscription status
      if (profile.subscription_status === 'cancelled') {
        results.skipped++
        continue
      }

      // Check if trial has expired
      if (profile.subscription_status === 'trial' && profile.trial_ends_at) {
        if (new Date(profile.trial_ends_at) < now) {
          results.skipped++
          continue
        }
      }

      if (!profile.github_access_token) {
        results.skipped++
        continue
      }

      // Check timezone and reflection window
      const userTimezone = profile.timezone || 'America/New_York'
      const userHour = parseInt(formatInTimeZone(now, userTimezone, 'H'))
      
      // Reflection window: 9 PM to 5 AM
      const isReflectionWindow = userHour >= 21 || userHour < 5
      if (!isReflectionWindow) {
        results.skipped++
        continue
      }

      // Calculate work date (late night = yesterday)
      let workDate = formatInTimeZone(now, userTimezone, 'yyyy-MM-dd')
      if (userHour < 5) {
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)
        workDate = formatInTimeZone(yesterday, userTimezone, 'yyyy-MM-dd')
      }

      // Check if user is actively coding (pushed within last hour)
      if (repo.webhook_id && repo.last_push_at) {
        const lastPush = new Date(repo.last_push_at)
        const hoursSinceLastPush = (now.getTime() - lastPush.getTime()) / (1000 * 60 * 60)
        
        if (hoursSinceLastPush < INACTIVITY_HOURS) {
          // Still actively coding - defer
          results.skipped++
          continue
        }
      }

      // Check if reflection already exists for this date
      const { data: existingReflection } = await supabase
        .from('reflections')
        .select('id')
        .eq('repo_id', repo.id)
        .eq('date', workDate)
        .single()

      if (existingReflection) {
        results.skipped++
        continue
      }

      // Check if job already exists (pending or processing)
      const { data: existingJob } = await supabase
        .from('reflection_jobs')
        .select('id, status')
        .eq('repo_id', repo.id)
        .eq('work_date', workDate)
        .in('status', ['pending', 'processing'])
        .single()

      if (existingJob) {
        results.alreadyQueued++
        continue
      }

      // Create pending job (ON CONFLICT DO NOTHING for safety)
      const { error: insertError } = await supabase
        .from('reflection_jobs')
        .upsert({
          repo_id: repo.id,
          work_date: workDate,
          status: 'pending',
          attempts: 0
        }, {
          onConflict: 'repo_id,work_date',
          ignoreDuplicates: true
        })

      if (insertError) {
        console.error(`[scheduler] Error creating job for ${repo.full_name}:`, insertError)
        continue
      }

      console.log(`[scheduler] Created job for ${repo.full_name} (${workDate})`)
      results.jobsCreated++
    }

    console.log(`[scheduler] Complete: ${results.jobsCreated} jobs created, ${results.skipped} skipped, ${results.alreadyQueued} already queued`)

    return NextResponse.json({
      success: true,
      ...results
    })

  } catch (error) {
    console.error('[scheduler] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
