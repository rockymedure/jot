import { GitHubCommit } from './github'

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
 * Generate a reflection from commits using Claude
 */
export async function generateReflection(
  repoName: string,
  commits: CommitSummary[]
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const commitSummary = commits.map(c => `
### Commit: ${c.sha.slice(0, 7)}
**Message:** ${c.message}
**Author:** ${c.author}
**Time:** ${c.date}
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
