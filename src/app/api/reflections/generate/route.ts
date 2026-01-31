import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchRepoCommits, fetchCommitDetails, writeFileToRepo, fetchRepoInfo, fetchReadme } from '@/lib/github'
import { generateReflection, generateFirstReflection, summarizeCommits } from '@/lib/claude'
import { generateComic } from '@/lib/fal'
import { sendReflectionEmail } from '@/lib/email'
import { format } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

export const runtime = 'nodejs'
export const maxDuration = 60

// Maximum number of commits to analyze in detail
const MAX_COMMITS_TO_ANALYZE = 20

/**
 * Generate a reflection for a specific repo
 * Called when a user first adds a repo for instant feedback
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { repoId, isInitial } = await request.json()
  
  if (!repoId) {
    return NextResponse.json({ error: 'Missing repoId' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  try {
    // Get the repo with user profile
    const { data: repo, error: repoError } = await serviceClient
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
          write_to_repo,
          timezone
        )
      `)
      .eq('id', repoId)
      .eq('user_id', user.id)
      .single()

    if (repoError || !repo) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
    }

    const profile = repo.profiles as unknown as {
      id: string
      email: string
      name: string
      github_access_token: string
      write_to_repo: boolean
      timezone: string
    }
    
    // Use user's timezone (default to America/New_York if not set)
    const userTimezone = profile.timezone || 'America/New_York'
    
    // Calculate "today" in the user's timezone
    const today = formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd')

    if (!profile.github_access_token) {
      return NextResponse.json({ error: 'No GitHub token' }, { status: 400 })
    }

    // Check if we already have a reflection for today
    const { data: existing } = await serviceClient
      .from('reflections')
      .select('id, content')
      .eq('repo_id', repo.id)
      .eq('date', today)
      .single()

    if (existing) {
      return NextResponse.json({ 
        success: true, 
        reflectionId: existing.id,
        message: 'Reflection already exists for today'
      })
    }

    // Determine the "since" cutoff
    let sinceDate: Date
    let timeframeDesc: string
    
    if (isInitial) {
      // For initial reflection, look back 30 days
      sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      timeframeDesc = '30 days'
    } else {
      // For subsequent reflections, use the last reflection time as cutoff
      const { data: lastReflection } = await serviceClient
        .from('reflections')
        .select('created_at')
        .eq('repo_id', repo.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (lastReflection?.created_at) {
        sinceDate = new Date(lastReflection.created_at)
        timeframeDesc = 'since last reflection'
      } else {
        // Fallback to 24h if no previous reflection
        sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
        timeframeDesc = '24 hours'
      }
    }
    
    const commits = await fetchRepoCommits(
      profile.github_access_token,
      repo.full_name,
      sinceDate
    )

    if (commits.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: `No new commits found (${timeframeDesc})`,
        noCommits: true
      })
    }

    // Fetch details for each commit (limited to first MAX_COMMITS_TO_ANALYZE)
    const detailedCommits = await Promise.all(
      commits.slice(0, MAX_COMMITS_TO_ANALYZE).map(c =>
        fetchCommitDetails(profile.github_access_token, repo.full_name, c.sha)
      )
    )

    // Generate reflection - use special first reflection if this is initial
    let result: { thinking: string; content: string }
    
    if (isInitial) {
      // Fetch project context for first reflection
      const [repoInfo, readme] = await Promise.all([
        fetchRepoInfo(profile.github_access_token, repo.full_name),
        fetchReadme(profile.github_access_token, repo.full_name)
      ])
      
      result = await generateFirstReflection({
        repoName: repo.name,
        description: repoInfo.description,
        language: repoInfo.language,
        topics: repoInfo.topics,
        readme,
        commits: summarizeCommits(detailedCommits),
        timezone: userTimezone
      })
    } else {
      result = await generateReflection(
        repo.name,
        summarizeCommits(detailedCommits),
        userTimezone
      )
    }

    // Generate comic strip (runs in parallel conceptually, but we need reflection content first)
    const comicUrl = await generateComic(result.content)

    // Store reflection
    const { data: reflection, error: insertError } = await serviceClient
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
        })),
        comic_url: comicUrl
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error storing reflection:', insertError)
      return NextResponse.json({ error: 'Failed to store reflection' }, { status: 500 })
    }

    // Send email
    if (profile.email) {
      // Get user's active repo count for contextual CTA
      const { count: userRepoCount } = await serviceClient
        .from('repos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_active', true)
      
      await sendReflectionEmail({
        to: profile.email,
        userName: profile.name,
        repoName: repo.name,
        date: today,
        content: result.content,
        comicUrl,
        reflectionId: reflection.id,
        commitCount: commits.length,
        userRepoCount: userRepoCount || 1
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
        // Log but don't fail the request if write fails
        console.error('Failed to write reflection to repo:', writeError)
      }
    }

    return NextResponse.json({ 
      success: true, 
      reflectionId: reflection.id,
      commitCount: commits.length,
      thinking: result.thinking
    })

  } catch (error) {
    console.error('Generate reflection error:', error)
    return NextResponse.json({ error: 'Failed to generate reflection' }, { status: 500 })
  }
}
