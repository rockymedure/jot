/**
 * Core reflection processing logic extracted for use by job queue workers.
 * 
 * This module handles the actual work of generating a reflection:
 * 1. Fetch commits from GitHub
 * 2. Generate reflection content with Claude
 * 3. Generate comic with fal.ai
 * 4. Save to database
 * 5. Send email notifications
 */

import { createServiceClient } from '@/lib/supabase/service'
import { fetchRepoCommits, fetchCommitDetails } from '@/lib/github'
import { generateReflection, generateQuietDayReflection, summarizeCommits, RecentReflection } from '@/lib/claude'
import { generateComic } from '@/lib/fal'
import { sendReflectionEmail, sendTipsEmail } from '@/lib/email'

// Maximum number of commits to analyze in detail
const MAX_COMMITS_TO_ANALYZE = 20

export interface ReflectionJob {
  id: string
  repo_id: string
  work_date: string
  attempts: number
}

export interface RepoWithProfile {
  id: string
  name: string
  full_name: string
  user_id: string
  last_push_at: string | null
  webhook_id: number | null
  profiles: {
    id: string
    email: string
    name: string
    github_access_token: string
    timezone: string
  }
}

export interface ProcessingResult {
  success: boolean
  reflectionId?: string
  error?: string
}

/**
 * Process a single reflection job.
 * This is the core logic extracted from the old cron job.
 */
export async function processReflectionJob(
  job: ReflectionJob,
  repo: RepoWithProfile
): Promise<ProcessingResult> {
  const supabase = createServiceClient()
  const profile = repo.profiles
  const userTimezone = profile.timezone || 'America/New_York'

  console.log(`[processor] Starting job ${job.id} for ${repo.full_name} on ${job.work_date}`)

  try {
    // Check if reflection already exists (in case of race condition)
    const { data: existing } = await supabase
      .from('reflections')
      .select('id')
      .eq('repo_id', repo.id)
      .eq('date', job.work_date)
      .single()

    if (existing) {
      console.log(`[processor] Reflection already exists for ${repo.full_name} on ${job.work_date}`)
      return { success: true, reflectionId: existing.id }
    }

    // Get the last reflection to determine the "since" cutoff
    const { data: lastReflection } = await supabase
      .from('reflections')
      .select('date, created_at')
      .eq('repo_id', repo.id)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    // Use last reflection time as cutoff, or default to 24h ago
    let sinceDate: Date
    if (lastReflection?.created_at) {
      sinceDate = new Date(lastReflection.created_at)
    } else {
      sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
    }

    console.log(`[processor] Fetching commits since ${sinceDate.toISOString()}`)

    // Fetch commits since last reflection
    const commits = await fetchRepoCommits(
      profile.github_access_token,
      repo.full_name,
      sinceDate
    )

    // Staleness detection
    if (repo.webhook_id && !repo.last_push_at && commits.length > 0) {
      console.warn(`[processor] [WEBHOOK STALE] ${repo.full_name}: has webhook but last_push_at is null with ${commits.length} commits`)
    }

    let result: { thinking: string; content: string; summary: string | null }
    let comicUrl: string | null = null

    if (commits.length === 0) {
      // Quiet day - no commits
      console.log(`[processor] ${repo.full_name}: quiet day (no commits)`)
      
      // Fetch last week's reflections for context
      const { data: recentReflectionsData } = await supabase
        .from('reflections')
        .select('date, summary, content, commit_count')
        .eq('repo_id', repo.id)
        .order('date', { ascending: false })
        .limit(7)
      
      const recentReflections: RecentReflection[] = (recentReflectionsData || []).map(r => ({
        date: r.date,
        summary: r.summary,
        content: r.content,
        commit_count: r.commit_count || 0
      }))
      
      const quietResult = await generateQuietDayReflection(repo.name, recentReflections)
      
      // If null, we've hit 4+ quiet days - go silent
      if (!quietResult) {
        console.log(`[processor] ${repo.full_name}: 4+ consecutive quiet days, skipping`)
        // Return success but with no reflection created - this is expected behavior
        return { success: true }
      }
      
      result = quietResult
      comicUrl = await generateComic(result.content)
    } else {
      console.log(`[processor] ${repo.full_name}: ${commits.length} commits`)

      // Fetch details for each commit (limited)
      const detailedCommits = await Promise.all(
        commits.slice(0, MAX_COMMITS_TO_ANALYZE).map(c =>
          fetchCommitDetails(profile.github_access_token, repo.full_name, c.sha)
        )
      )

      // Generate reflection
      result = await generateReflection(
        repo.name,
        summarizeCommits(detailedCommits),
        userTimezone
      )

      // Generate comic strip
      comicUrl = await generateComic(result.content)
    }

    // Store reflection
    const { data: reflection, error: insertError } = await supabase
      .from('reflections')
      .insert({
        repo_id: repo.id,
        date: job.work_date,
        content: result.content,
        summary: result.summary,
        commit_count: commits.length,
        commits_data: commits.length > 0 ? commits.map(c => ({
          sha: c.sha,
          message: c.commit.message,
          date: c.commit.author.date
        })) : [],
        comic_url: comicUrl
      })
      .select('id')
      .single()

    if (insertError || !reflection) {
      console.error(`[processor] Error storing reflection for ${repo.full_name}:`, insertError)
      return { success: false, error: insertError?.message || 'Failed to store reflection' }
    }

    console.log(`[processor] Reflection stored: ${reflection.id}`)

    // Reset last_push_at to prevent duplicate reflections
    if (repo.last_push_at) {
      await supabase
        .from('repos')
        .update({ last_push_at: null })
        .eq('id', repo.id)
    }

    // Send reflection email
    if (profile.email) {
      try {
        await sendReflectionEmail({
          to: profile.email,
          userName: profile.name,
          repoName: repo.name,
          date: job.work_date,
          content: result.content,
          comicUrl
        })
        console.log(`[processor] Email sent to ${profile.email}`)
        
        // Check if this is the user's 3rd reflection - send tips email
        const { count: totalReflections } = await supabase
          .from('reflections')
          .select('*', { count: 'exact', head: true })
          .eq('repo_id', repo.id)
        
        if (totalReflections === 3) {
          try {
            await sendTipsEmail({
              to: profile.email,
              userName: profile.name
            })
            console.log(`[processor] Tips email sent to ${profile.email}`)
          } catch (tipsError) {
            console.error(`[processor] Failed to send tips email:`, tipsError)
            // Don't fail the job for tips email failure
          }
        }
      } catch (emailError) {
        console.error(`[processor] Failed to send reflection email:`, emailError)
        // Don't fail the job for email failure - reflection is already saved
      }
    }

    console.log(`[processor] Successfully completed job ${job.id} for ${repo.full_name}`)
    return { success: true, reflectionId: reflection.id }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[processor] Error processing job ${job.id}:`, errorMessage)
    return { success: false, error: errorMessage }
  }
}
