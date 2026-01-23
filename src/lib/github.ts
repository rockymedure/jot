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
