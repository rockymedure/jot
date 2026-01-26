import { GitHubCommit } from './github'
import { formatInTimeZone } from 'date-fns-tz'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Claude API configuration constants
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 16000
const THINKING_BUDGET_TOKENS = 10000
const MAX_COMMITS_FOR_FIRST_REFLECTION = 30

interface CommitSummary {
  sha: string
  message: string
  author: string
  date: string
  stats?: {
    additions: number
    deletions: number
  }
  files?: string[]
}

export interface ReflectionResult {
  thinking: string
  content: string
  summary: string | null
}

/**
 * Parse and extract summary from reflection content
 * Returns { content: cleaned content without summary tag, summary: extracted summary or null }
 */
export function parseSummaryFromContent(rawContent: string): { content: string; summary: string | null } {
  const summaryMatch = rawContent.match(/<!--\s*summary:\s*(.+?)\s*-->/)
  if (summaryMatch) {
    const summary = summaryMatch[1].trim().slice(0, 150) // Cap at 150 chars
    const content = rawContent.replace(/<!--\s*summary:\s*.+?\s*-->\n?/, '').trim()
    return { content, summary }
  }
  return { content: rawContent, summary: null }
}

// ============================================================================
// Claude API Helpers - Consolidated fetch and response parsing
// ============================================================================

interface ClaudeCallOptions {
  prompt: string
  stream?: boolean
  maxTokens?: number
  thinkingBudget?: number
}

/**
 * Make a call to Claude's API with consistent configuration
 * Handles API key validation, headers, and error handling
 */
async function callClaude(options: ClaudeCallOptions): Promise<Response> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: options.maxTokens ?? MAX_TOKENS,
      stream: options.stream ?? false,
      thinking: {
        type: 'enabled',
        budget_tokens: options.thinkingBudget ?? THINKING_BUDGET_TOKENS
      },
      messages: [{ role: 'user', content: options.prompt }]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${error}`)
  }

  return response
}

/**
 * Parse a non-streaming Claude response into ReflectionResult
 * Extracts thinking, content, and summary from the response
 */
async function parseClaudeResponse(response: Response): Promise<ReflectionResult> {
  const data = await response.json()
  
  let thinking = ''
  let rawContent = ''
  
  for (const block of data.content) {
    if (block.type === 'thinking') {
      thinking = block.thinking
    } else if (block.type === 'text') {
      rawContent = block.text
    }
  }
  
  const { content, summary } = parseSummaryFromContent(rawContent)
  return { thinking, content, summary }
}

export interface StreamEvent {
  type: 'thinking' | 'text' | 'done'
  content: string
}

/**
 * Build the reflection prompt
 */
function buildReflectionPrompt(repoName: string, commits: CommitSummary[], timezone: string): string {
  const commitSummary = commits.map(c => `
### Commit: ${c.sha.slice(0, 7)}
**Message:** ${c.message}
**Author:** ${c.author}
**Time:** ${formatCommitTime(c.date, timezone)}
${c.stats ? `**Changes:** +${c.stats.additions} -${c.stats.deletions}` : ''}
${c.files?.length ? `**Files:** ${c.files.slice(0, 10).join(', ')}${c.files.length > 10 ? ` (+${c.files.length - 10} more)` : ''}` : ''}
`).join('\n---\n')

  return `You are a supportive co-founder reviewing a solo founder's day of work on their project "${repoName}".

Here are today's commits:

${commitSummary}

Write an evening reflection in markdown that:
1. Acknowledges what they accomplished - name the real progress made
2. Offers honest perspective on the work - what's working, what might need attention
3. Notes the shape of the day - focused deep work? Lots of small fixes? Exploration?
4. Ends with 1-2 thoughtful questions to consider for tomorrow

Be honest but supportive. Solo founders need clarity, not criticism. Recognize that infrastructure work, refactoring, and exploration are valuable even when they don't ship user-facing features. Your job is to help them see their work clearly and think about what's next.

Format with these sections:
## What You Did
## Observations  
## Questions for Tomorrow

At the very end, add a one-line summary (max 100 chars) in this exact format:
<!-- summary: Your concise summary here -->

This summary should capture the essence of the day in a single punchy sentence. Examples:
- "Shipped auth flow and cleaned up edge cases"
- "Deep refactoring day - solid foundation work"
- "Explored multiple directions, good context building"

Keep it concise - this should be a quick evening read, not a novel.`
}

/**
 * Stream a reflection from Claude with extended thinking
 * Returns a ReadableStream that yields SSE events
 */
export async function streamReflection(
  repoName: string,
  commits: CommitSummary[],
  timezone: string = 'America/New_York'
): Promise<ReadableStream<Uint8Array>> {
  console.log(`[CLAUDE] Starting streamReflection for ${repoName} with ${commits.length} commits`)

  const prompt = buildReflectionPrompt(repoName, commits, timezone)
  const response = await callClaude({ prompt, stream: true })

  console.log(`[CLAUDE] Stream response received, transforming...`)
  return transformClaudeStream(response.body!)
}

/**
 * Transform Claude's SSE stream into our simplified event format
 */
function transformClaudeStream(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let buffer = ''
  let chunkCount = 0
  let thinkingChunks = 0
  let textChunks = 0

  return new ReadableStream({
    async start(controller) {
      const reader = input.getReader()
      console.log(`[CLAUDE] Transform stream started`)
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            console.log(`[CLAUDE] Stream complete. Chunks: ${chunkCount}, Thinking: ${thinkingChunks}, Text: ${textChunks}`)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`))
            controller.close()
            break
          }
          chunkCount++

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              
              try {
                const event = JSON.parse(data)
                
                // Handle content deltas
                if (event.type === 'content_block_delta') {
                  if (event.delta?.type === 'thinking_delta' && event.delta?.thinking) {
                    thinkingChunks++
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', content: event.delta.thinking })}\n\n`))
                  } else if (event.delta?.type === 'text_delta' && event.delta?.text) {
                    textChunks++
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`))
                  }
                } else if (event.type === 'error') {
                  console.error(`[CLAUDE] Stream error event:`, event.error)
                }
              } catch {
                // Ignore parse errors for incomplete JSON
              }
            }
          }
        }
      } catch (error) {
        controller.error(error)
      }
    }
  })
}

/**
 * Format a UTC timestamp to a human-readable format in the user's timezone
 */
function formatCommitTime(isoDate: string, timezone: string): string {
  try {
    const date = new Date(isoDate)
    return formatInTimeZone(date, timezone, "h:mm a 'on' EEEE, MMM d")
  } catch {
    return isoDate
  }
}

/**
 * Generate a reflection from commits using Claude with extended thinking (non-streaming)
 */
export async function generateReflection(
  repoName: string,
  commits: CommitSummary[],
  timezone: string = 'America/New_York'
): Promise<ReflectionResult> {
  const prompt = buildReflectionPrompt(repoName, commits, timezone)
  const response = await callClaude({ prompt })
  return parseClaudeResponse(response)
}

export interface RecentReflection {
  date: string
  summary: string | null
  content: string
  commit_count: number
}

/**
 * Count consecutive quiet days from recent reflections
 */
export function countConsecutiveQuietDays(recentReflections: RecentReflection[]): number {
  let count = 0
  for (const r of recentReflections) {
    if (r.commit_count === 0) {
      count++
    } else {
      break
    }
  }
  return count
}

/**
 * Build the quiet day reflection prompt (no commits)
 */
function buildQuietDayPrompt(repoName: string, recentReflections: RecentReflection[], consecutiveQuietDays: number): string {
  // Find the last reflection with actual work
  const lastWorkReflection = recentReflections.find(r => r.commit_count > 0)
  const lastWorkContext = lastWorkReflection 
    ? `\n\nTheir last coding session (${lastWorkReflection.date}): ${lastWorkReflection.summary || lastWorkReflection.content.slice(0, 150)}...\n`
    : ''

  if (consecutiveQuietDays >= 2) {
    // Day 2-3: Re-engagement message
    return `You are jot, a supportive co-founder for a solo founder working on "${repoName}".

This is day ${consecutiveQuietDays + 1} without commits. Time for a brief, warm "see you soon" message.
${lastWorkContext}
Write a very short message (2-3 sentences max) that:
1. Acknowledges they've been away without guilt or pressure
2. Reminds them jot will be here when they're ready to build again
3. Expresses genuine interest in seeing what they'll work on next

Tone: Like a friend saying "no rush, catch you later" - not a pushy app trying to get engagement.

Format:
## See You Soon

[2-3 sentences - warm, brief, no pressure]

At the very end, add a one-line summary in this exact format:
<!-- summary: Your concise summary here -->

Examples:
- "A few days away. Jot's here when you're ready"
- "Taking time offline - see you when you're back"

Keep it under 50 words. This is the last message until they push code again.`
  }

  // Day 1: Standard quiet day
  const recentContext = recentReflections.length > 0
    ? `\n\nHere's what they've been working on this past week:\n${recentReflections.filter(r => r.commit_count > 0).slice(0, 5).map(r => 
        `- ${r.date}: ${r.summary || r.content.slice(0, 150)}...`
      ).join('\n')}\n`
    : ''

  return `You are a supportive co-founder checking in with a solo founder who didn't push any code today on their project "${repoName}".

This is a quiet day - no commits. That's completely fine. Not every day is a coding day.
${recentContext}
Write a brief, warm reflection that:
1. Acknowledges the quiet day without judgment
2. ${recentReflections.length > 0 ? 'References what they\'ve been working on recently - connect the quiet day to their recent momentum' : 'Normalizes that building includes thinking, planning, and resting'}
3. Offers a gentle prompt for reflection - what might they be working through?
4. Keeps it short and supportive (not preachy)

Possible angles (pick what feels natural):
- Maybe they're letting recent work settle before the next push
- Maybe they're designing something in their head before building
- Maybe they're researching or learning
- Maybe they needed a break after intense work (that's healthy)
- Maybe life happened (it does)

Format:
## A Quiet Day

[2-3 sentences acknowledging and normalizing, referencing recent work if available]

## Worth Thinking About

[One gentle question or prompt, ideally connected to what they've been building]

At the very end, add a one-line summary in this exact format:
<!-- summary: Your concise summary here -->

Examples:
- "No commits today - sometimes the best work happens offline"
- "A quiet day for the codebase, not necessarily for the mind"
- "Rest day after a big push - well earned"

Keep it under 100 words total. Don't lecture. Don't make them feel guilty.`
}

/**
 * Generate a quiet day reflection (no commits)
 * Returns null if we should skip (4+ consecutive quiet days)
 */
export async function generateQuietDayReflection(
  repoName: string,
  recentReflections: RecentReflection[] = []
): Promise<ReflectionResult | null> {
  const consecutiveQuietDays = countConsecutiveQuietDays(recentReflections)
  
  // After 3 quiet days (this would be day 4+), go silent
  if (consecutiveQuietDays >= 3) {
    return null
  }

  const prompt = buildQuietDayPrompt(repoName, recentReflections, consecutiveQuietDays)
  const response = await callClaude({ prompt, maxTokens: 1000, thinkingBudget: 2000 })
  return parseClaudeResponse(response)
}

/**
 * Transform GitHub commits to summary format
 */
export function summarizeCommits(commits: GitHubCommit[]): CommitSummary[] {
  return commits.map(c => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author.name,
    date: c.commit.author.date,
    stats: c.stats ? {
      additions: c.stats.additions,
      deletions: c.stats.deletions
    } : undefined,
    files: c.files?.map(f => f.filename)
  }))
}

export interface ProjectContext {
  repoName: string
  description: string | null
  language: string | null
  topics: string[]
  readme: string | null
  commits: CommitSummary[]
  timezone?: string
}

/**
 * Build the first reflection prompt
 */
export function buildFirstReflectionPrompt(context: ProjectContext): string {
  const tz = context.timezone || 'America/New_York'
  const commitSummary = context.commits.slice(0, MAX_COMMITS_FOR_FIRST_REFLECTION).map(c => {
    const dateStr = formatInTimeZone(new Date(c.date), tz, 'MMM d')
    return `\n- ${c.sha.slice(0, 7)}: ${c.message.split('\n')[0]} (${dateStr})${c.files?.length ? ` [${c.files.length} files]` : ''}`
  }).join('')

  return `You are jot — an AI co-founder who's just been brought on to partner with a solo builder. This is your FIRST conversation with them. You've been given access to their project and need to demonstrate that you understand what they're building.

PROJECT: ${context.repoName}
${context.description ? `DESCRIPTION: ${context.description}` : ''}
${context.language ? `PRIMARY LANGUAGE: ${context.language}` : ''}
${context.topics?.length ? `TOPICS: ${context.topics.join(', ')}` : ''}

${context.readme ? `README:\n${context.readme}\n` : ''}

RECENT COMMIT HISTORY (last 30 days):
${commitSummary || 'No recent commits found.'}

Write your first reflection as their new co-founder. This should:

1. **Demonstrate understanding** - Show you get what they're building and why it matters
2. **Identify the current phase** - Are they in early exploration? Building MVP? Polishing for launch? Pivoting?
3. **Notice patterns** - What do their commits reveal about how they work? What areas get the most attention?
4. **Ask thoughtful questions** - 2-3 questions a curious co-founder would ask to understand their vision and priorities better

Be warm and genuine. You're excited to be part of this and want to help them succeed. Solo founders often lack someone who truly understands what they're building - be that person.

Format:
## First Impressions
(What you understand about the project and what they're trying to build)

## Where You Are
(Your read on the current phase and recent momentum)

## Questions I Have
(The things a co-founder would want to understand before diving in)

At the very end, add a one-line summary (max 100 chars) in this exact format:
<!-- summary: Your concise summary here -->

This summary should capture your first impression in a single punchy sentence. Examples:
- "Ambitious MVP with solid momentum - let's ship it"
- "Great vision, but scope is expanding fast"
- "Strong foundation, needs focus on core features"

Keep it genuine. No corporate speak. Talk like a smart friend who happens to be great at building products.`
}

/**
 * Stream a first reflection from Claude with extended thinking
 * Returns a ReadableStream that yields SSE events
 */
export async function streamFirstReflection(context: ProjectContext): Promise<ReadableStream<Uint8Array>> {
  console.log(`[CLAUDE] Starting streamFirstReflection for ${context.repoName} with ${context.commits.length} commits`)

  const prompt = buildFirstReflectionPrompt(context)
  const response = await callClaude({ prompt, stream: true })

  return transformClaudeStream(response.body!)
}

/**
 * Generate the FIRST reflection - jot introducing itself and understanding the project (non-streaming)
 */
export async function generateFirstReflection(context: ProjectContext): Promise<ReflectionResult> {
  const prompt = buildFirstReflectionPrompt(context)
  const response = await callClaude({ prompt })
  return parseClaudeResponse(response)
}
