import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRepoWebhook, deleteRepoWebhook } from '@/lib/github'
import { isValidUUID } from '@/lib/utils'
import crypto from 'crypto'

const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL 
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/github`
  : 'https://your-app.vercel.app/api/webhooks/github'

/**
 * Create a webhook for a repo
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { repoId } = await request.json()
  if (!repoId || !isValidUUID(repoId)) {
    return NextResponse.json({ error: 'Invalid repoId' }, { status: 400 })
  }

  // Get repo and user's GitHub token
  const { data: repo, error: repoError } = await supabase
    .from('repos')
    .select('id, full_name, webhook_id, profiles!inner(github_access_token)')
    .eq('id', repoId)
    .eq('user_id', user.id)
    .single()

  if (repoError || !repo) {
    return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
  }

  const profile = repo.profiles as unknown as { github_access_token: string }
  if (!profile.github_access_token) {
    return NextResponse.json({ error: 'No GitHub token' }, { status: 400 })
  }

  // If webhook already exists, return success
  if (repo.webhook_id) {
    return NextResponse.json({ success: true, webhookId: repo.webhook_id })
  }

  // Generate a random secret for this webhook
  const webhookSecret = crypto.randomBytes(32).toString('hex')

  try {
    console.log(`[WEBHOOK] Creating webhook for ${repo.full_name}...`)
    
    const { id: webhookId } = await createRepoWebhook(
      profile.github_access_token,
      repo.full_name,
      WEBHOOK_URL,
      webhookSecret
    )

    // Save webhook ID and secret to the repo
    await supabase
      .from('repos')
      .update({ 
        webhook_id: webhookId,
        webhook_secret: webhookSecret
      })
      .eq('id', repoId)

    console.log(`[WEBHOOK] Successfully created webhook ${webhookId} for ${repo.full_name}`)
    return NextResponse.json({ success: true, webhookId })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[WEBHOOK FAILED] ${repo.full_name}: ${errorMessage}`)
    
    // Don't fail the whole operation if webhook creation fails
    // The cron will still work as a fallback
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create webhook. Reflections will still be generated on schedule.' 
    })
  }
}

/**
 * Delete a webhook from a repo
 */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const repoId = searchParams.get('repoId')
  
  if (!repoId || !isValidUUID(repoId)) {
    return NextResponse.json({ error: 'Invalid repoId' }, { status: 400 })
  }

  // Get repo and user's GitHub token
  const { data: repo, error: repoError } = await supabase
    .from('repos')
    .select('id, full_name, webhook_id, profiles!inner(github_access_token)')
    .eq('id', repoId)
    .eq('user_id', user.id)
    .single()

  if (repoError || !repo) {
    return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
  }

  const profile = repo.profiles as unknown as { github_access_token: string }

  // If no webhook, nothing to delete
  if (!repo.webhook_id) {
    return NextResponse.json({ success: true })
  }

  try {
    await deleteRepoWebhook(
      profile.github_access_token,
      repo.full_name,
      repo.webhook_id
    )
  } catch (error) {
    console.error('Failed to delete webhook:', error)
    // Continue anyway to clear the local record
  }

  // Clear webhook info from repo
  await supabase
    .from('repos')
    .update({ 
      webhook_id: null,
      webhook_secret: null,
      last_push_at: null
    })
    .eq('id', repoId)

  return NextResponse.json({ success: true })
}
