import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchRepoCommits, fetchCommitDetails, writeFileToRepo } from '@/lib/github'
import { generateReflection, summarizeCommits } from '@/lib/claude'
import { sendReflectionEmail } from '@/lib/email'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

// Vercel cron config
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

/**
 * Daily cron job to generate reflections for all active repos
 * 
 * Set up in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/generate-reflections",
 *     "schedule": "0 1 * * *"
 *   }]
 * }
 */
export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
        profiles!inner(
          id,
          email,
          name,
          github_access_token,
          subscription_status,
          trial_ends_at,
          write_to_repo,
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
        write_to_repo: boolean
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

      try {
        // Check if we already have a reflection for today
        const { data: existing } = await supabase
          .from('reflections')
          .select('id')
          .eq('repo_id', repo.id)
          .eq('date', today)
          .single()

        if (existing) {
          console.log(`Skipping ${repo.full_name}: already processed today`)
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

        if (commits.length === 0) {
          console.log(`Skipping ${repo.full_name}: no commits today`)
          results.skipped++
          continue
        }

        console.log(`Processing ${repo.full_name}: ${commits.length} commits`)

        // Fetch details for each commit (limited to first 20)
        const detailedCommits = await Promise.all(
          commits.slice(0, 20).map(c =>
            fetchCommitDetails(profile.github_access_token, repo.full_name, c.sha)
          )
        )

        // Generate reflection
        const result = await generateReflection(
          repo.name,
          summarizeCommits(detailedCommits),
          userTimezone
        )

        // Store reflection
        const { error: insertError } = await supabase
          .from('reflections')
          .insert({
            repo_id: repo.id,
            date: today,
            content: result.content,
            commit_count: commits.length,
            commits_data: commits.map(c => ({
              sha: c.sha,
              message: c.commit.message,
              date: c.commit.author.date
            }))
          })

        if (insertError) {
          console.error(`Error storing reflection for ${repo.full_name}:`, insertError)
          results.errors++
          continue
        }

        // Send email
        if (profile.email) {
          await sendReflectionEmail({
            to: profile.email,
            userName: profile.name,
            repoName: repo.name,
            date: today,
            content: result.content
          })
        }

        // Write reflection to repo if enabled
        if (profile.write_to_repo !== false) {
          try {
            const formattedDate = format(new Date(today), 'EEEE, MMMM d, yyyy')
            await writeFileToRepo(
              profile.github_access_token,
              repo.full_name,
              `jot/${today}.md`,
              result.content,
              `jot: reflection for ${formattedDate}`
            )
          } catch (writeError) {
            // Log but don't fail the cron job if write fails
            console.error(`Failed to write reflection to ${repo.full_name}:`, writeError)
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
