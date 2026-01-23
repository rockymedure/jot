import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { query, type Options } from '@anthropic-ai/claude-agent-sdk'
import { exec } from 'child_process'
import { promisify } from 'util'
import { rm, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const execAsync = promisify(exec)

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for deep review

interface ReviewRequest {
  reflectionId: string
}

/**
 * POST /api/review
 * Run a deep code review on a reflection's commits using the Agent SDK
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reflectionId } = await request.json() as ReviewRequest
  
  if (!reflectionId) {
    return NextResponse.json({ error: 'Missing reflectionId' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  try {
    // Load the reflection with repo and profile info
    const { data: reflection, error: reflectionError } = await serviceClient
      .from('reflections')
      .select(`
        id,
        date,
        content,
        commits_data,
        repos!inner(
          id,
          name,
          full_name,
          profiles!inner(
            id,
            github_access_token
          )
        )
      `)
      .eq('id', reflectionId)
      .single()

    if (reflectionError || !reflection) {
      return NextResponse.json({ error: 'Reflection not found' }, { status: 404 })
    }

    // Verify user owns this reflection
    const repo = reflection.repos as unknown as {
      id: string
      name: string
      full_name: string
      profiles: { id: string; github_access_token: string }
    }

    if (repo.profiles.id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const accessToken = repo.profiles.github_access_token
    if (!accessToken) {
      return NextResponse.json({ error: 'No GitHub token' }, { status: 400 })
    }

    // Create temp directory for the repo clone
    const tempDir = await mkdtemp(join(tmpdir(), 'jot-review-'))
    
    try {
      // Clone the repo (shallow clone for speed)
      console.log(`[REVIEW] Cloning ${repo.full_name} to ${tempDir}`)
      const cloneUrl = `https://x-access-token:${accessToken}@github.com/${repo.full_name}.git`
      await execAsync(`git clone --depth 50 "${cloneUrl}" "${tempDir}"`, {
        timeout: 60000 // 1 minute timeout for clone
      })

      // Build the review prompt with commit info
      const commits = reflection.commits_data as { sha: string; message: string; date: string }[] || []
      const commitSummary = commits.slice(0, 10).map(c => 
        `- ${c.sha.slice(0, 7)}: ${c.message.split('\n')[0]}`
      ).join('\n')

      const reviewPrompt = `
You are jot, a co-founder reviewing work that was just shipped on "${repo.name}".

## The Work Being Reviewed

These commits were made:
${commitSummary || 'No specific commits provided - review the recent work.'}

## Your Task

1. First, understand the project structure (use Glob to explore)
2. Read the files that were likely changed based on the commit messages
3. Look for issues: bugs, edge cases, security concerns, missing error handling
4. Check if there are tests for the changed code
5. Note any code quality issues

## What to Look For

- Logic errors and edge cases
- Security issues (validation, auth, injection)
- Error handling gaps
- Missing tests for critical paths
- Inconsistencies with patterns used elsewhere

## Output

Provide a thorough but concise code review. Be direct. Focus on what matters.
If you find specific issues, show the relevant code and suggest improvements.
`

      console.log(`[REVIEW] Running agent review in ${tempDir}`)
      
      let reviewResult = ''
      
      // Run the agent in the cloned repo directory
      const agentOptions: Options = {
        cwd: tempDir,
        allowedTools: ['Glob', 'Grep', 'Read'], // Read-only tools
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true
      }
      
      for await (const message of query({
        prompt: reviewPrompt,
        options: agentOptions
      })) {
        if ('result' in message) {
          reviewResult = message.result as string
        }
      }

      // Update the reflection with the review
      await serviceClient
        .from('reflections')
        .update({
          review_content: reviewResult,
          review_requested_at: new Date().toISOString()
        })
        .eq('id', reflectionId)

      return NextResponse.json({
        success: true,
        review: reviewResult
      })

    } finally {
      // Clean up temp directory
      try {
        await rm(tempDir, { recursive: true, force: true })
        console.log(`[REVIEW] Cleaned up ${tempDir}`)
      } catch (cleanupError) {
        console.error(`[REVIEW] Failed to clean up ${tempDir}:`, cleanupError)
      }
    }

  } catch (error) {
    console.error('[REVIEW] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to generate review',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
