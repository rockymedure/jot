import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchRepoCommits, fetchCommitDetails, writeFileToRepo, fetchRepoInfo, fetchReadme } from '@/lib/github'
import { streamReflection, streamFirstReflection, summarizeCommits, ProjectContext } from '@/lib/claude'
import { sendReflectionEmail } from '@/lib/email'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

export const runtime = 'nodejs'
export const maxDuration = 120 // Increased for initial reflections

/**
 * Stream a reflection generation with thinking visible in real-time
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { repoId, isInitial } = await request.json()
  
  if (!repoId) {
    return new Response(JSON.stringify({ error: 'Missing repoId' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
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
      return new Response(JSON.stringify({ error: 'Repo not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const profile = repo.profiles as unknown as {
      id: string
      email: string
      name: string
      github_access_token: string
      write_to_repo: boolean
      timezone: string
    }
    
    const userTimezone = profile.timezone || 'America/New_York'
    const today = formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd')

    if (!profile.github_access_token) {
      return new Response(JSON.stringify({ error: 'No GitHub token' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if we already have a reflection for today
    const { data: existing } = await serviceClient
      .from('reflections')
      .select('id')
      .eq('repo_id', repo.id)
      .eq('date', today)
      .single()

    if (existing) {
      return new Response(JSON.stringify({ 
        error: 'Reflection already exists for today',
        existingId: existing.id
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Determine the "since" cutoff based on isInitial
    let sinceDate: Date
    
    if (isInitial) {
      // For initial reflection, look back 30 days
      sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    } else {
      // For subsequent reflections, use the last reflection time as cutoff
      const { data: lastReflection } = await serviceClient
        .from('reflections')
        .select('created_at')
        .eq('repo_id', repo.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      sinceDate = lastReflection?.created_at 
        ? new Date(lastReflection.created_at)
        : new Date(Date.now() - 24 * 60 * 60 * 1000)
    }

    const commits = await fetchRepoCommits(
      profile.github_access_token,
      repo.full_name,
      sinceDate
    )

    if (commits.length === 0) {
      return new Response(JSON.stringify({ 
        error: isInitial ? 'No commits found in the last 30 days' : 'No new commits since last reflection',
        noCommits: true
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Fetch commit details
    const detailedCommits = await Promise.all(
      commits.slice(0, 20).map(c =>
        fetchCommitDetails(profile.github_access_token, repo.full_name, c.sha)
      )
    )

    // Stream the reflection - use appropriate function based on isInitial
    let stream: ReadableStream<Uint8Array>
    
    if (isInitial) {
      // Fetch project context for first reflection
      const [repoInfo, readme] = await Promise.all([
        fetchRepoInfo(profile.github_access_token, repo.full_name),
        fetchReadme(profile.github_access_token, repo.full_name)
      ])
      
      const context: ProjectContext = {
        repoName: repo.name,
        description: repoInfo.description,
        language: repoInfo.language,
        topics: repoInfo.topics,
        readme,
        commits: summarizeCommits(detailedCommits),
        timezone: userTimezone
      }
      
      stream = await streamFirstReflection(context)
    } else {
      stream = await streamReflection(
        repo.name,
        summarizeCommits(detailedCommits),
        userTimezone
      )
    }

    // Tee the stream - one for the client, one for saving
    const [clientStream, saveStream] = stream.tee()
    
    // Start consuming the save stream in the background to collect and save
    consumeAndSave(saveStream, serviceClient, repo, profile, today, commits, userTimezone)

    return new Response(clientStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('Stream reflection error:', error)
    return new Response(JSON.stringify({ error: 'Failed to generate reflection' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * Consume the save stream and save the reflection when complete
 */
async function consumeAndSave(
  stream: ReadableStream<Uint8Array>,
  serviceClient: ReturnType<typeof createServiceClient>,
  repo: { id: string; name: string; full_name: string },
  profile: { email: string; name: string; github_access_token: string; write_to_repo: boolean },
  today: string,
  commits: Array<{ sha: string; commit: { message: string; author: { date: string } } }>,
  userTimezone: string
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const text = decoder.decode(value, { stream: true })
      const lines = text.split('\n')
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'text') {
              fullContent += event.content
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
    
    // Save after stream is fully consumed
    if (fullContent) {
      await saveReflection(
        serviceClient,
        repo,
        profile,
        today,
        fullContent,
        commits,
        userTimezone
      )
    }
  } catch (error) {
    console.error('Error consuming stream:', error)
  }
}

/**
 * Save the reflection after streaming completes
 */
async function saveReflection(
  serviceClient: ReturnType<typeof createServiceClient>,
  repo: { id: string; name: string; full_name: string },
  profile: { email: string; name: string; github_access_token: string; write_to_repo: boolean },
  today: string,
  content: string,
  commits: Array<{ sha: string; commit: { message: string; author: { date: string } } }>,
  userTimezone: string
) {
  try {
    // Store reflection
    const { data: reflection } = await serviceClient
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

    // Send email
    if (profile.email && reflection) {
      await sendReflectionEmail({
        to: profile.email,
        userName: profile.name,
        repoName: repo.name,
        date: today,
        content
      })
    }

    // Write to repo if enabled
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
        console.error('Failed to write reflection to repo:', writeError)
      }
    }
  } catch (error) {
    console.error('Failed to save reflection:', error)
  }
}
