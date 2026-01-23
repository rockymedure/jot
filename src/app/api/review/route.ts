import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { query, type Options } from '@anthropic-ai/claude-agent-sdk'
import { exec } from 'child_process'
import { promisify } from 'util'
import { rm, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { sendReviewEmail } from '@/lib/email'

const execAsync = promisify(exec)

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for deep review

interface ReviewRequest {
  reflectionId: string
}

/**
 * Parse review content to extract summary and issue titles for email
 */
function parseReviewForEmail(content: string): { 
  summary: string | undefined
  issueCount: number
  issueTitles: string[] 
} {
  // Extract summary - try multiple patterns
  let summary: string | undefined
  const summaryPatterns = [
    /##\s*Summary\s*\n([\s\S]*?)(?=\n##|$)/i,
    /##\s*Overview\s*\n([\s\S]*?)(?=\n##|$)/i,
    /###\s*\*\*Overview\*\*\s*\n([\s\S]*?)(?=\n##|---)/i,
  ]
  for (const pattern of summaryPatterns) {
    const match = content.match(pattern)
    if (match) {
      // Clean up the summary - remove markdown formatting and limit length
      summary = match[1]
        .replace(/\*\*/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 300)
      if (summary.length === 300) summary += '...'
      break
    }
  }

  // Extract issue titles
  const issueTitles: string[] = []
  const issuePatterns = [
    /###\s*\d+[.:]\s*\*\*([^*\n]+)\*\*/g,  // ### 1. **Title**
    /###\s*\d+[.:]\s*([^\n]+)/g,            // ### 1. Title
  ]
  
  for (const pattern of issuePatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const title = match[1]
        .replace(/\*\*/g, '')
        .replace(/\([^)]+\)/g, '')  // Remove priority markers
        .trim()
      if (title && !issueTitles.includes(title)) {
        issueTitles.push(title)
      }
    }
    if (issueTitles.length > 0) break // Use first pattern that finds issues
  }

  return {
    summary,
    issueCount: issueTitles.length,
    issueTitles
  }
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
            email,
            name,
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
      profiles: { id: string; email: string; name: string; github_access_token: string }
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

## Output Format

Structure your review EXACTLY like this:

## Summary
2-3 sentences overview of what you found.

## Issues Found

### 1. Issue Title
**File:** \`path/to/file.ts\`
**Problem:** What's wrong
**Fix:** How to fix it

### 2. Next Issue Title
(continue numbering for each issue)

## What's Working Well
- Positive observation 1
- Positive observation 2

If no issues found, still include the sections but note "No significant issues found."
Be direct. Focus on what matters.
`

      console.log(`[REVIEW] Running agent review in ${tempDir}`)
      
      let reviewResult = ''
      
      // Run the agent in the cloned repo directory
      const agentOptions: Options = {
        cwd: tempDir,
        allowedTools: ['Glob', 'Grep', 'Read'], // Read-only tools
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        stderr: (data: string) => {
          console.error('[REVIEW] Claude Code stderr:', data)
        }
      }
      
      console.log('[REVIEW] Starting agent with ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET')
      
      const messages: Array<{ type: string; timestamp: string; content: unknown }> = []
      
      for await (const message of query({
        prompt: reviewPrompt,
        options: agentOptions
      })) {
        const timestamp = new Date().toISOString()
        
        // Log the full message for debugging
        console.log('[REVIEW] Message:', JSON.stringify({
          type: message.type,
          timestamp,
          // Log key fields based on message type
          ...(message.type === 'assistant' && 'message' in message ? {
            stopReason: (message.message as { stop_reason?: string })?.stop_reason,
            content: ((message.message as { content?: Array<{ type: string; text?: string; name?: string }> })?.content ?? []).map((c) => ({
              type: c.type,
              // For text blocks, truncate long content
              ...(c.type === 'text' ? { text: c.text?.slice(0, 200) + (c.text && c.text.length > 200 ? '...' : '') } : {}),
              // For tool use, show the tool name
              ...(c.type === 'tool_use' ? { name: c.name } : {})
            }))
          } : {}),
          ...(message.type === 'user' && 'message' in message ? {
            toolResults: (message.message as { content?: unknown[] })?.content?.length
          } : {}),
          ...('result' in message ? { hasResult: true, resultLength: String(message.result).length } : {})
        }))
        
        // Track messages for potential future streaming
        messages.push({ type: message.type, timestamp, content: message })
        
        if ('result' in message) {
          reviewResult = message.result as string
        }
      }
      
      console.log('[REVIEW] Total messages:', messages.length)

      // Update the reflection with the review
      await serviceClient
        .from('reflections')
        .update({
          review_content: reviewResult,
          review_requested_at: new Date().toISOString()
        })
        .eq('id', reflectionId)

      // Extract summary, issue count, and issue titles for the email
      const { summary, issueCount, issueTitles } = parseReviewForEmail(reviewResult)

      // Send email notification
      if (repo.profiles.email) {
        try {
          await sendReviewEmail({
            to: repo.profiles.email,
            userName: repo.profiles.name,
            repoName: repo.name,
            date: reflection.date,
            issueCount,
            reflectionId,
            summary,
            issueTitles
          })
          console.log('[REVIEW] Email sent to', repo.profiles.email)
        } catch (emailError) {
          console.error('[REVIEW] Failed to send email:', emailError)
          // Don't fail the request if email fails
        }
      }

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
