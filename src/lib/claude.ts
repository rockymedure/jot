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
 * Generate a reflection from commits using Claude
 */
export async function generateReflection(
  repoName: string,
  commits: CommitSummary[],
  timezone: string = 'America/New_York'
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const commitSummary = commits.map(c => `
### Commit: ${c.sha.slice(0, 7)}
**Message:** ${c.message}
**Author:** ${c.author}
**Time:** ${formatCommitTime(c.date, timezone)}
${c.stats ? `**Changes:** +${c.stats.additions} -${c.stats.deletions}` : ''}
${c.files?.length ? `**Files:** ${c.files.slice(0, 10).join(', ')}${c.files.length > 10 ? ` (+${c.files.length - 10} more)` : ''}` : ''}
`).join('\n---\n')

  const prompt = `You are a blunt, direct co-founder reviewing a solo founder's day of work on their project "${repoName}".

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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
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
  return data.content[0].text
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

interface ProjectContext {
  repoName: string
  description: string | null
  language: string | null
  topics: string[]
  readme: string | null
  commits: CommitSummary[]
  timezone?: string
}

/**
 * Generate the FIRST reflection - jot introducing itself and understanding the project
 */
export async function generateFirstReflection(context: ProjectContext): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const tz = context.timezone || 'America/New_York'
  const commitSummary = context.commits.slice(0, 30).map(c => {
    const dateStr = formatInTimeZone(new Date(c.date), tz, 'MMM d')
    return `\n- ${c.sha.slice(0, 7)}: ${c.message.split('\n')[0]} (${dateStr})${c.files?.length ? ` [${c.files.length} files]` : ''}`
  }).join('')

  const prompt = `You are jot — an AI co-founder who's just been brought on to partner with a solo builder. This is your FIRST conversation with them. You've been given access to their project and need to demonstrate that you understand what they're building.

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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
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
  return data.content[0].text
}
