import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import crypto from 'crypto'

/**
 * GitHub webhook endpoint for push events
 * Updates last_push_at for the repo to enable inactivity-based reflection generation
 */
export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  const event = request.headers.get('x-github-event')
  
  // Only handle push events
  if (event !== 'push') {
    return NextResponse.json({ message: 'Ignored non-push event' })
  }

  let payload: {
    repository: {
      id: number
      full_name: string
    }
    pusher: {
      name: string
    }
    commits?: Array<{
      id: string
      message: string
    }>
  }

  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Find the repo by github_repo_id
  const { data: repo, error: repoError } = await supabase
    .from('repos')
    .select('id, webhook_secret')
    .eq('github_repo_id', payload.repository.id)
    .eq('is_active', true)
    .single()

  if (repoError || !repo) {
    // Repo not tracked or not active - ignore silently
    return NextResponse.json({ message: 'Repo not tracked' })
  }

  // Verify webhook signature if secret is set
  if (repo.webhook_secret && signature) {
    const hmac = crypto.createHmac('sha256', repo.webhook_secret)
    const digest = 'sha256=' + hmac.update(body).digest('hex')
    
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
      console.error('Invalid webhook signature for repo:', payload.repository.full_name)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  // Update last_push_at
  const { error: updateError } = await supabase
    .from('repos')
    .update({ last_push_at: new Date().toISOString() })
    .eq('id', repo.id)

  if (updateError) {
    console.error('Failed to update last_push_at:', updateError)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  console.log(`[webhook] Push received for ${payload.repository.full_name}: ${payload.commits?.length || 0} commits`)

  return NextResponse.json({ 
    success: true,
    repo: payload.repository.full_name,
    commits: payload.commits?.length || 0
  })
}
