import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchRepoCommits, fetchCommitDetails, writeFileToRepo } from '@/lib/github'
import { generateReflection, summarizeCommits } from '@/lib/claude'
import { sendReflectionEmail } from '@/lib/email'
import { format } from 'date-fns'

export const runtime = 'nodejs'
export const maxDuration = 60

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
  const today = new Date().toISOString().split('T')[0]

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
          write_to_repo
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
    }

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

    // For initial reflection, look back 7 days to find something to reflect on
    // For regular daily reflections, use 24 hours
    const lookbackMs = isInitial 
      ? 7 * 24 * 60 * 60 * 1000  // 7 days
      : 24 * 60 * 60 * 1000      // 24 hours
    
    const sinceDate = new Date(Date.now() - lookbackMs)
    
    const commits = await fetchRepoCommits(
      profile.github_access_token,
      repo.full_name,
      sinceDate
    )

    if (commits.length === 0) {
      const timeframe = isInitial ? '7 days' : '24 hours'
      return NextResponse.json({ 
        success: true, 
        message: `No commits found in the last ${timeframe}`,
        noCommits: true
      })
    }

    // Fetch details for each commit (limited to first 20)
    const detailedCommits = await Promise.all(
      commits.slice(0, 20).map(c =>
        fetchCommitDetails(profile.github_access_token, repo.full_name, c.sha)
      )
    )

    // Generate reflection
    const content = await generateReflection(
      repo.name,
      summarizeCommits(detailedCommits)
    )

    // Store reflection
    const { data: reflection, error: insertError } = await serviceClient
      .from('reflections')
      .insert({
        repo_id: repo.id,
        date: today,
        content,
        commit_count: commits.length,
        commits_data: commits.map(c => ({
          sha: c.sha,
          message: c.commit.message,
          date: c.commit.author.date
        }))
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error storing reflection:', insertError)
      return NextResponse.json({ error: 'Failed to store reflection' }, { status: 500 })
    }

    // Send email
    if (profile.email) {
      await sendReflectionEmail({
        to: profile.email,
        userName: profile.name,
        repoName: repo.name,
        date: today,
        content
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
          content,
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
      commitCount: commits.length
    })

  } catch (error) {
    console.error('Generate reflection error:', error)
    return NextResponse.json({ error: 'Failed to generate reflection' }, { status: 500 })
  }
}
