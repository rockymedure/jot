import { GitHubCommit } from './github'
import { formatInTimeZone } from 'date-fns-tz'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

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

  return `You are a blunt, direct co-founder reviewing a solo founder's day of work on their project "${repoName}".

Here are today's commits:

${commitSummary}

Write an evening reflection in markdown that:
1. Summarizes what they actually accomplished (the substance, not just files touched)
2. Calls out anything that looks like scope creep, yak shaving, or distraction
3. Notes momentum - was this a focused day? Scattered? Stuck on one thing too long?
4. Ends with 1-2 pointed questions to think about for tomorrow

Be direct. No fluff. No cheerleading unless they really earned it. Talk like a co-founder who respects their time and wants them to ship.

Format with these sections:
## What You Did
## Observations  
## Questions for Tomorrow

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
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const prompt = buildReflectionPrompt(repoName, commits, timezone)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      stream: true,
      thinking: {
        type: 'enabled',
        budget_tokens: 10000
      },
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${error}`)
  }

  return transformClaudeStream(response.body!)
}

/**
 * Transform Claude's SSE stream into our simplified event format
 */
function transformClaudeStream(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let buffer = ''

  return new ReadableStream({
    async start(controller) {
      const reader = input.getReader()
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`))
            controller.close()
            break
          }

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
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', content: event.delta.thinking })}\n\n`))
                  } else if (event.delta?.type === 'text_delta' && event.delta?.text) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`))
                  }
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
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const prompt = buildReflectionPrompt(repoName, commits, timezone)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      thinking: {
        type: 'enabled',
        budget_tokens: 10000
      },
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  
  // Extract thinking and text content
  let thinking = ''
  let content = ''
  
  for (const block of data.content) {
    if (block.type === 'thinking') {
      thinking = block.thinking
    } else if (block.type === 'text') {
      content = block.text
    }
  }
  
  return { thinking, content }
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
  const commitSummary = context.commits.slice(0, 30).map(c => {
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
4. **Ask the hard questions** - 2-3 questions a real co-founder would ask. About direction, priorities, what's being avoided.

Be direct but not cold. You're excited to be part of this, but you're also the person who will tell them hard truths. This is the start of a partnership.

Format:
## First Impressions
(What you understand about the project and what they're trying to build)

## Where You Are
(Your read on the current phase and recent momentum)

## Questions I Have
(The things a co-founder would want to understand before diving in)

Keep it genuine. No corporate speak. Talk like a smart friend who happens to be great at building products.`
}

/**
 * Stream a first reflection from Claude with extended thinking
 * Returns a ReadableStream that yields SSE events
 */
export async function streamFirstReflection(context: ProjectContext): Promise<ReadableStream<Uint8Array>> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const prompt = buildFirstReflectionPrompt(context)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      stream: true,
      thinking: {
        type: 'enabled',
        budget_tokens: 10000
      },
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${error}`)
  }

  return transformClaudeStream(response.body!)
}

/**
 * Generate the FIRST reflection - jot introducing itself and understanding the project (non-streaming)
 */
export async function generateFirstReflection(context: ProjectContext): Promise<ReflectionResult> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const prompt = buildFirstReflectionPrompt(context)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      thinking: {
        type: 'enabled',
        budget_tokens: 10000
      },
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  
  // Extract thinking and text content
  let thinking = ''
  let content = ''
  
  for (const block of data.content) {
    if (block.type === 'thinking') {
      thinking = block.thinking
    } else if (block.type === 'text') {
      content = block.text
    }
  }
  
  return { thinking, content }
}
