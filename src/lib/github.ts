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
 * Fetch commits from a repository for the last 24 hours
 */
export async function fetchRepoCommits(
  accessToken: string,
  fullName: string,
  since?: Date
): Promise<GitHubCommit[]> {
  const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000)
  
  const response = await fetch(
    `https://api.github.com/repos/${fullName}/commits?since=${sinceDate.toISOString()}&per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  )

  if (!response.ok) {
    if (response.status === 409) {
      // Empty repository
      return []
    }
    throw new Error(`GitHub API error: ${response.status}`)
  }

  return response.json()
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
