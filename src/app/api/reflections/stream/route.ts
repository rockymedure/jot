import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchRepoCommits, fetchCommitDetails, writeFileToRepo, fetchRepoInfo, fetchReadme } from '@/lib/github'
import { streamReflection, streamFirstReflection, summarizeCommits, parseSummaryFromContent, ProjectContext } from '@/lib/claude'
import { generateComic } from '@/lib/fal'
import { sendReflectionEmail } from '@/lib/email'
import { isValidTimezone } from '@/lib/utils'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

export const runtime = 'nodejs'
export const maxDuration = 120 // Increased for initial reflections

// Maximum number of commits to analyze in detail
const MAX_COMMITS_TO_ANALYZE = 20

// Simple logger with timestamps
const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [STREAM] [${level}]`
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data))
  } else {
    console.log(`${prefix} ${message}`)
  }
}

/**
 * Stream a reflection generation with thinking visible in real-time
 */
export async function POST(request: Request) {
  const requestId = Math.random().toString(36).slice(2, 8)
  log('INFO', `Request started`, { requestId })
  
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    log('WARN', 'Unauthorized request', { requestId })
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { repoId, isInitial, regenerate } = await request.json()
  log('INFO', `Request params`, { requestId, repoId, isInitial, regenerate, userId: user.id })
  
  if (!repoId) {
    log('WARN', 'Missing repoId', { requestId })
    return new Response(JSON.stringify({ error: 'Missing repoId' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const serviceClient = createServiceClient()

  try {
    // Get the repo with user profile
    log('INFO', 'Fetching repo...', { requestId, repoId })
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
      log('WARN', 'Repo not found', { requestId, repoId, error: repoError?.message })
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
    
    const DEFAULT_TIMEZONE = 'America/New_York'
    const userTimezone = profile.timezone && isValidTimezone(profile.timezone) 
      ? profile.timezone 
      : DEFAULT_TIMEZONE
    const today = formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd')
    log('INFO', 'Repo found', { requestId, repoName: repo.full_name, timezone: userTimezone, today, originalTimezone: profile.timezone })

    if (!profile.github_access_token) {
      log('WARN', 'No GitHub token', { requestId })
      return new Response(JSON.stringify({ error: 'No GitHub token' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if we already have a reflection for today
    // Use maybeSingle() to avoid throwing if multiple exist (shouldn't happen but defensive)
    const { data: existing } = await serviceClient
      .from('reflections')
      .select('id')
      .eq('repo_id', repo.id)
      .eq('date', today)
      .maybeSingle()

    if (existing) {
      if (regenerate) {
        // Delete existing reflection to regenerate
        log('INFO', 'Regenerating - deleting existing reflection', { requestId, existingId: existing.id })
        await serviceClient
          .from('reflections')
          .delete()
          .eq('id', existing.id)
      } else {
        log('INFO', 'Reflection already exists', { requestId, existingId: existing.id })
        return new Response(JSON.stringify({ 
          error: 'Reflection already exists for today',
          existingId: existing.id
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    // Determine the "since" cutoff based on isInitial
    let sinceDate: Date
    
    if (isInitial) {
      sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      log('INFO', 'Initial reflection - looking back 30 days', { requestId, sinceDate: sinceDate.toISOString() })
    } else {
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
      log('INFO', 'Subsequent reflection', { requestId, sinceDate: sinceDate.toISOString(), hadPrevious: !!lastReflection })
    }

    log('INFO', 'Fetching commits...', { requestId, repo: repo.full_name })
    const commits = await fetchRepoCommits(
      profile.github_access_token,
      repo.full_name,
      sinceDate
    )
    log('INFO', `Found ${commits.length} commits`, { requestId })

    if (commits.length === 0) {
      log('INFO', 'No commits found', { requestId })
      return new Response(JSON.stringify({ 
        error: isInitial ? 'No commits found in the last 30 days' : 'No new commits since last reflection',
        noCommits: true
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Fetch commit details
    log('INFO', `Fetching details for ${Math.min(commits.length, MAX_COMMITS_TO_ANALYZE)} commits...`, { requestId })
    const detailedCommits = await Promise.all(
      commits.slice(0, MAX_COMMITS_TO_ANALYZE).map(c =>
        fetchCommitDetails(profile.github_access_token, repo.full_name, c.sha)
      )
    )
    log('INFO', 'Commit details fetched', { requestId })

    // Stream the reflection - use appropriate function based on isInitial
    let stream: ReadableStream<Uint8Array>
    
    if (isInitial) {
      log('INFO', 'Fetching repo info and README for first reflection...', { requestId })
      const [repoInfo, readme] = await Promise.all([
        fetchRepoInfo(profile.github_access_token, repo.full_name),
        fetchReadme(profile.github_access_token, repo.full_name)
      ])
      log('INFO', 'Repo context fetched', { requestId, hasReadme: !!readme, language: repoInfo.language })
      
      const context: ProjectContext = {
        repoName: repo.name,
        description: repoInfo.description,
        language: repoInfo.language,
        topics: repoInfo.topics,
        readme,
        commits: summarizeCommits(detailedCommits),
        timezone: userTimezone
      }
      
      log('INFO', 'Starting Claude stream (first reflection)...', { requestId })
      stream = await streamFirstReflection(context)
    } else {
      log('INFO', 'Starting Claude stream (regular reflection)...', { requestId })
      stream = await streamReflection(
        repo.name,
        summarizeCommits(detailedCommits),
        userTimezone
      )
    }
    log('INFO', 'Claude stream created, teeing...', { requestId })

    // Tee the stream - one for the client, one for saving
    const [clientStream, saveStream] = stream.tee()
    
    // Start consuming the save stream in the background to collect and save
    log('INFO', 'Starting background save consumer', { requestId })
    consumeAndSave(saveStream, serviceClient, repo, profile, today, commits, userTimezone, requestId)
      .catch((error) => {
        log('ERROR', 'Background save failed', { requestId, error: error instanceof Error ? error.message : String(error) })
      })

    log('INFO', 'Returning stream to client', { requestId })
    return new Response(clientStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    log('ERROR', 'Stream reflection error', { requestId, error: error instanceof Error ? error.message : String(error) })
    return new Response(JSON.stringify({ error: 'Failed to generate reflection' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// Timeout for stream consumption (5 minutes - generous for extended thinking)
const STREAM_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Read from stream with timeout to prevent infinite hangs
 */
async function readWithTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  timeoutMs: number
): Promise<ReadableStreamReadResult<T>> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Stream read timeout')), timeoutMs)
  })
  return Promise.race([reader.read(), timeoutPromise])
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
  userTimezone: string,
  requestId: string
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let thinkingLength = 0
  let chunkCount = 0
  let buffer = '' // Buffer for incomplete lines split across chunks
  
  log('INFO', 'Save consumer started', { requestId })
  
  try {
    while (true) {
      const { done, value } = await readWithTimeout(reader, STREAM_TIMEOUT_MS)
      if (done) {
        // Process any remaining buffered content
        if (buffer.trim()) {
          log('INFO', 'Processing remaining buffer', { requestId, bufferLength: buffer.length })
          processLine(buffer)
        }
        log('INFO', 'Stream finished', { requestId, chunkCount, thinkingLength, contentLength: fullContent.length })
        break
      }
      
      chunkCount++
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        processLine(line)
      }
    }
    
    function processLine(line: string) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'thinking') {
            thinkingLength += event.content.length
          } else if (event.type === 'text') {
            fullContent += event.content
          } else if (event.type === 'done') {
            log('INFO', 'Received done event', { requestId })
          }
        } catch (e) {
          // Log parse errors for debugging (but don't spam for empty lines)
          if (line.slice(6).trim()) {
            log('WARN', 'Failed to parse SSE line', { requestId, line: line.slice(0, 100), error: e instanceof Error ? e.message : String(e) })
          }
        }
      }
    }
    
    // Save after stream is fully consumed
    if (fullContent) {
      // Parse summary from content
      const { content: cleanContent, summary } = parseSummaryFromContent(fullContent)
      log('INFO', 'Saving reflection...', { requestId, contentLength: cleanContent.length, hasSummary: !!summary })
      await saveReflection(
        serviceClient,
        repo,
        profile,
        today,
        cleanContent,
        summary,
        commits,
        userTimezone,
        requestId
      )
    } else {
      log('WARN', 'No content to save!', { requestId, thinkingLength })
    }
  } catch (error) {
    log('ERROR', 'Error consuming stream', { requestId, error: error instanceof Error ? error.message : String(error) })
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
  summary: string | null,
  commits: Array<{ sha: string; commit: { message: string; author: { date: string } } }>,
  userTimezone: string,
  requestId: string
) {
  try {
    // Save reflection FIRST (before comic) to ensure we don't lose it
    log('INFO', 'Inserting reflection into DB...', { requestId, repoId: repo.id, date: today, hasSummary: !!summary })
    const { data: reflection, error: insertError } = await serviceClient
      .from('reflections')
      .insert({
        repo_id: repo.id,
        date: today,
        content,
        summary,
        commit_count: commits.length,
        commits_data: commits.map(c => ({
          sha: c.sha,
          message: c.commit.message,
          date: c.commit.author.date
        })),
        comic_url: null // Will update after comic generation
      })
      .select()
      .single()

    if (insertError) {
      log('ERROR', 'Failed to insert reflection', { requestId, error: insertError.message })
      return
    }
    
    log('INFO', 'Reflection saved!', { requestId, reflectionId: reflection?.id })

    // Generate comic strip (can fail without losing the reflection)
    let comicUrl: string | null = null
    try {
      log('INFO', 'Generating comic...', { requestId })
      comicUrl = await generateComic(content, reflection?.id)
      log('INFO', 'Comic generation complete', { requestId, hasComic: !!comicUrl })
      
      // Update reflection with comic URL
      if (comicUrl && reflection) {
        await serviceClient
          .from('reflections')
          .update({ comic_url: comicUrl })
          .eq('id', reflection.id)
        log('INFO', 'Updated reflection with comic URL', { requestId })
      }
    } catch (comicError) {
      log('ERROR', 'Comic generation failed, continuing without comic', { requestId, error: comicError instanceof Error ? comicError.message : String(comicError) })
    }

    // Send email
    if (profile.email && reflection) {
      try {
        log('INFO', 'Sending email...', { requestId, to: profile.email })
        await sendReflectionEmail({
          to: profile.email,
          userName: profile.name,
          repoName: repo.name,
          date: today,
          content,
          comicUrl
        })
        log('INFO', 'Email sent', { requestId })
      } catch (emailError) {
        log('ERROR', 'Failed to send email, continuing with save', { requestId, error: emailError instanceof Error ? emailError.message : String(emailError) })
      }
    }

    // Write to repo if enabled
    if (profile.write_to_repo !== false) {
      try {
        log('INFO', 'Writing to repo...', { requestId, path: `jot/${today}.md` })
        const formattedDate = format(new Date(today), 'EEEE, MMMM d, yyyy')
        await writeFileToRepo(
          profile.github_access_token,
          repo.full_name,
          `jot/${today}.md`,
          content,
          `jot: reflection for ${formattedDate}`
        )
        log('INFO', 'Written to repo', { requestId })
      } catch (writeError) {
        log('ERROR', 'Failed to write to repo', { requestId, error: writeError instanceof Error ? writeError.message : String(writeError) })
      }
    }
    
    log('INFO', 'Save complete!', { requestId })
  } catch (error) {
    log('ERROR', 'Failed to save reflection', { requestId, error: error instanceof Error ? error.message : String(error) })
  }
}
