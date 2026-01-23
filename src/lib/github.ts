export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  description: string | null
  html_url: string
  pushed_at: string
}

export interface GitHubCommit {
  sha: string
  commit: {
    message: string
    author: {
      name: string
      email: string
      date: string
    }
  }
  html_url: string
  stats?: {
    additions: number
    deletions: number
    total: number
  }
  files?: {
    filename: string
    status: string
    additions: number
    deletions: number
    patch?: string
  }[]
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Make a GitHub API request with rate limit handling and exponential backoff
 */
async function githubFetch(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options)
    
    // Check rate limit headers
    const remaining = response.headers.get('X-RateLimit-Remaining')
    const resetTime = response.headers.get('X-RateLimit-Reset')
    
    if (remaining && parseInt(remaining) < 10) {
      console.warn(`[github] Rate limit low: ${remaining} requests remaining`)
    }
    
    // Handle rate limiting (429) with exponential backoff
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      const waitTime = retryAfter 
        ? parseInt(retryAfter) * 1000 
        : Math.min(1000 * Math.pow(2, attempt), 30000) // Exponential backoff, max 30s
      
      console.warn(`[github] Rate limited, waiting ${waitTime}ms before retry (attempt ${attempt + 1}/${maxRetries})`)
      await sleep(waitTime)
      continue
    }
    
    // Handle secondary rate limits (403 with specific message)
    if (response.status === 403) {
      const body = await response.text()
      if (body.includes('secondary rate limit')) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 60000)
        console.warn(`[github] Secondary rate limit hit, waiting ${waitTime}ms`)
        await sleep(waitTime)
        continue
      }
      // Re-create response since we consumed the body
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    }
    
    return response
  }
  
  throw lastError || new Error('Max retries exceeded for GitHub API')
}

/**
 * Fetch user's repositories from GitHub
 */
export async function fetchUserRepos(accessToken: string): Promise<GitHubRepo[]> {
  const response = await fetch('https://api.github.com/user/repos?sort=pushed&per_page=100', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Fetch commits from a repository across ALL branches
 * Uses the Events API to catch commits on any branch
 */
export async function fetchRepoCommits(
  accessToken: string,
  fullName: string,
  since?: Date
): Promise<GitHubCommit[]> {
  const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000)
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github.v3+json',
  }
  
  // First, get all branches (limit to 20 to avoid rate limit issues)
  const branchesResponse = await githubFetch(
    `https://api.github.com/repos/${fullName}/branches?per_page=20`,
    { headers }
  )

  if (!branchesResponse.ok) {
    if (branchesResponse.status === 409) {
      // Empty repository
      return []
    }
    throw new Error(`GitHub API error fetching branches: ${branchesResponse.status}`)
  }

  const branches = await branchesResponse.json() as { name: string }[]
  
  // Fetch commits from each branch with rate limit handling
  const allCommits: GitHubCommit[] = []
  const seenShas = new Set<string>()
  
  for (const branch of branches) {
    try {
      const response = await githubFetch(
        `https://api.github.com/repos/${fullName}/commits?sha=${branch.name}&since=${sinceDate.toISOString()}&per_page=100`,
        { headers }
      )

      if (!response.ok) {
        // Skip branches we can't access
        console.log(`[github] Skipping branch ${branch.name}: ${response.status}`)
        continue
      }

      const commits = await response.json() as GitHubCommit[]
      
      for (const commit of commits) {
        if (!seenShas.has(commit.sha)) {
          seenShas.add(commit.sha)
          allCommits.push(commit)
        }
      }
    } catch (error) {
      console.error(`[github] Error fetching commits for branch ${branch.name}:`, error)
      continue
    }
  }
  
  // Sort by date, newest first
  allCommits.sort((a, b) => 
    new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime()
  )

  return allCommits
}

/**
 * Fetch detailed commit info including diff
 */
export async function fetchCommitDetails(
  accessToken: string,
  fullName: string,
  sha: string
): Promise<GitHubCommit> {
  const response = await fetch(
    `https://api.github.com/repos/${fullName}/commits/${sha}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  )

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Fetch repo info including description
 */
export async function fetchRepoInfo(
  accessToken: string,
  fullName: string
): Promise<{ description: string | null; language: string | null; topics: string[] }> {
  const response = await fetch(
    `https://api.github.com/repos/${fullName}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  )

  if (!response.ok) {
    return { description: null, language: null, topics: [] }
  }

  const data = await response.json()
  return {
    description: data.description,
    language: data.language,
    topics: data.topics || []
  }
}

/**
 * Fetch README content from a repository
 */
export async function fetchReadme(
  accessToken: string,
  fullName: string
): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${fullName}/readme`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3.raw',
      },
    }
  )

  if (!response.ok) {
    return null
  }

  const content = await response.text()
  // Truncate if too long
  return content.length > 3000 ? content.slice(0, 3000) + '\n\n[...truncated]' : content
}

/**
 * Write a file to a repository (create or update)
 * Uses GitHub's Create or update file contents API
 * https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
 */
export async function writeFileToRepo(
  accessToken: string,
  fullName: string,
  path: string,
  content: string,
  message: string
): Promise<void> {
  // First, try to get the existing file to get its SHA (needed for updates)
  let existingSha: string | undefined

  const getResponse = await fetch(
    `https://api.github.com/repos/${fullName}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  )

  if (getResponse.ok) {
    const existingFile = await getResponse.json()
    existingSha = existingFile.sha
  }

  // Create or update the file
  const body: {
    message: string
    content: string
    sha?: string
  } = {
    message,
    content: Buffer.from(content).toString('base64'),
  }

  if (existingSha) {
    body.sha = existingSha
  }

  const response = await fetch(
    `https://api.github.com/repos/${fullName}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Failed to write file to repo:', error)
    throw new Error(`GitHub API error: ${response.status}`)
  }
}

/**
 * Create a webhook on a repository to receive push events
 */
export async function createRepoWebhook(
  accessToken: string,
  fullName: string,
  webhookUrl: string,
  secret: string
): Promise<{ id: number }> {
  const response = await fetch(
    `https://api.github.com/repos/${fullName}/hooks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret,
          insecure_ssl: '0',
        },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Failed to create webhook:', error)
    throw new Error(`GitHub API error: ${response.status}`)
  }

  const data = await response.json()
  return { id: data.id }
}

/**
 * Delete a webhook from a repository
 */
export async function deleteRepoWebhook(
  accessToken: string,
  fullName: string,
  webhookId: number
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${fullName}/hooks/${webhookId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  )

  // 404 is ok - webhook may already be deleted
  if (!response.ok && response.status !== 404) {
    const error = await response.text()
    console.error('Failed to delete webhook:', error)
    throw new Error(`GitHub API error: ${response.status}`)
  }
}
