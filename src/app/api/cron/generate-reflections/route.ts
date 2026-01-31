import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchRepoCommits, fetchCommitDetails } from '@/lib/github'
import { generateReflection, generateQuietDayReflection, summarizeCommits, RecentReflection } from '@/lib/claude'
import { generateComic } from '@/lib/fal'
import { sendReflectionEmail, sendTipsEmail } from '@/lib/email'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

// Vercel cron config
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

// How long after last push to wait before generating reflection
const INACTIVITY_HOURS = 1

// Maximum number of commits to analyze in detail
const MAX_COMMITS_TO_ANALYZE = 20

/**
 * Cron job to generate reflections (runs every 15 minutes via Supabase pg_cron)
 * 
 * Timing logic:
 * - Reflection window: 9 PM to 5 AM in user's timezone
 * - At 9 PM+: generate unless user pushed within last hour (still coding)
 * - Late-night reflections (midnight-5 AM) are dated to previous day
 * 
 * This ensures:
 * - Predictable 9 PM reflections for most users
 * - Late-night sessions are fully captured and attributed to the right day
 */
export async function GET(request: Request) {
  // Verify cron secret - required in production
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  // In production, CRON_SECRET must be set
  if (process.env.NODE_ENV === 'production' && !cronSecret) {
    console.error('CRON_SECRET not configured in production')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  try {
    // Get all active repos with their user's GitHub token
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
          name,
          github_access_token,
          subscription_status,
          trial_ends_at,
          timezone
        )
      `)
      .eq('is_active', true)

    if (reposError) {
      console.error('Error fetching repos:', reposError)
      return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 })
    }

    console.log(`Processing ${repos?.length || 0} active repos`)

    const results = {
      processed: 0,
      skipped: 0,
      errors: 0
    }

    for (const repo of repos || []) {
      const profile = repo.profiles as unknown as {
        id: string
        email: string
        name: string
        github_access_token: string
        subscription_status: string
        trial_ends_at: string
        timezone: string
      }
      
      // Use user's timezone for "today" calculation
      const userTimezone = profile.timezone || 'America/New_York'
      const today = formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd')

      // Check subscription status
      if (profile.subscription_status === 'cancelled') {
        console.log(`Skipping ${repo.full_name}: subscription cancelled`)
        results.skipped++
        continue
      }

      // Check if trial has expired
      if (profile.subscription_status === 'trial' && profile.trial_ends_at) {
        if (new Date(profile.trial_ends_at) < new Date()) {
          console.log(`Skipping ${repo.full_name}: trial expired`)
          results.skipped++
          continue
        }
      }

      if (!profile.github_access_token) {
        console.log(`Skipping ${repo.full_name}: no GitHub token`)
        results.skipped++
        continue
      }

      // Determine if it's time to generate a reflection
      // Standard time: 9 PM in user's timezone
      // Late-night support: If coding past 9 PM, wait for 1h inactivity (even past midnight)
      const now = new Date()
      const userHour = parseInt(formatInTimeZone(now, userTimezone, 'H'))
      
      // Reflection window: 9 PM to 5 AM (supports late-night coding sessions)
      const isReflectionWindow = userHour >= 21 || userHour < 5
      if (!isReflectionWindow) {
        results.skipped++
        continue
      }
      
      // Late-night reflections (midnight to 5 AM) belong to yesterday's work day
      // This matches developer mental model: "worked late last night" = yesterday's session
      let workDate = today
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
          // Still actively coding late night - defer until they stop
          console.log(`[late-night] ${repo.full_name}: active (${hoursSinceLastPush.toFixed(1)}h since last push), deferring`)
          results.skipped++
          continue
        }
        console.log(`[9pm+] ${repo.full_name}: ${hoursSinceLastPush.toFixed(1)}h since last push, generating reflection`)
      } else {
        console.log(`[9pm] ${repo.full_name}: 9 PM in ${userTimezone}, generating reflection`)
      }

      try {
        // Check if we already have a reflection for this work day
        const { data: existing } = await supabase
          .from('reflections')
          .select('id')
          .eq('repo_id', repo.id)
          .eq('date', workDate)
          .single()

        if (existing) {
          console.log(`Skipping ${repo.full_name}: already processed for ${workDate}`)
          results.skipped++
          continue
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

        // Fetch commits since last reflection
        const commits = await fetchRepoCommits(
          profile.github_access_token,
          repo.full_name,
          sinceDate
        )

        // Staleness detection: if repo has webhook but last_push_at is null and there are commits,
        // the webhook might be broken (not receiving push events from GitHub)
        if (repo.webhook_id && !repo.last_push_at && commits.length > 0) {
          console.warn(`[WEBHOOK STALE] ${repo.full_name}: has webhook but last_push_at is null with ${commits.length} commits - webhook may be broken`)
        }

        let result: { thinking: string; content: string; summary: string | null }
        let comicUrl: string | null = null

        if (commits.length === 0) {
          // Quiet day - no commits, but still send a reflection
          console.log(`Processing ${repo.full_name}: quiet day (no commits)`)
          
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
            console.log(`Skipping ${repo.full_name}: 4+ consecutive quiet days, going silent until next push`)
            results.skipped++
            continue
          }
          
          result = quietResult
          comicUrl = await generateComic(result.content)
        } else {
          console.log(`Processing ${repo.full_name}: ${commits.length} commits`)

          // Fetch details for each commit (limited to first MAX_COMMITS_TO_ANALYZE)
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
            date: workDate,
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
          console.error(`Error storing reflection for ${repo.full_name}:`, insertError)
          results.errors++
          continue
        }

        // Reset last_push_at to prevent duplicate reflections for the same work session
        if (repo.last_push_at) {
          await supabase
            .from('repos')
            .update({ last_push_at: null })
            .eq('id', repo.id)
        }

        // Send reflection email
        if (profile.email) {
          await sendReflectionEmail({
            to: profile.email,
            userName: profile.name,
            repoName: repo.name,
            date: workDate,
            content: result.content,
            comicUrl
          })
          
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
              console.log(`[cron] Sent tips email to ${profile.email}`)
            } catch (tipsError) {
              console.error(`[cron] Failed to send tips email:`, tipsError)
            }
          }
        }

        console.log(`Successfully processed ${repo.full_name}`)
        results.processed++

      } catch (error) {
        console.error(`Error processing ${repo.full_name}:`, error)
        results.errors++
      }
    }

    return NextResponse.json({
      success: true,
      ...results
    })

  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
