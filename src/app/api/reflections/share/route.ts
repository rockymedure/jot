import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/**
 * Generate or retrieve a share token for a reflection
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reflectionId } = await request.json()
  if (!reflectionId) {
    return NextResponse.json({ error: 'Missing reflectionId' }, { status: 400 })
  }

  // Check if user owns this reflection (via repo ownership)
  const { data: reflection, error: fetchError } = await supabase
    .from('reflections')
    .select('id, share_token, repos!inner(user_id)')
    .eq('id', reflectionId)
    .single()

  if (fetchError || !reflection) {
    return NextResponse.json({ error: 'Reflection not found' }, { status: 404 })
  }

  const repo = reflection.repos as unknown as { user_id: string }
  if (repo.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // If already has a share token, return it
  if (reflection.share_token) {
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/share/${reflection.share_token}`
    return NextResponse.json({ shareToken: reflection.share_token, shareUrl })
  }

  // Generate a new share token
  const shareToken = crypto.randomBytes(16).toString('hex')

  const { error: updateError } = await supabase
    .from('reflections')
    .update({ share_token: shareToken })
    .eq('id', reflectionId)

  if (updateError) {
    console.error('Failed to save share token:', updateError)
    return NextResponse.json({ error: 'Failed to generate share link' }, { status: 500 })
  }

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/share/${shareToken}`
  return NextResponse.json({ shareToken, shareUrl })
}

/**
 * Remove share token (unshare)
 */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const reflectionId = searchParams.get('reflectionId')
  
  if (!reflectionId) {
    return NextResponse.json({ error: 'Missing reflectionId' }, { status: 400 })
  }

  // Check ownership
  const { data: reflection } = await supabase
    .from('reflections')
    .select('id, repos!inner(user_id)')
    .eq('id', reflectionId)
    .single()

  if (!reflection) {
    return NextResponse.json({ error: 'Reflection not found' }, { status: 404 })
  }

  const repo = reflection.repos as unknown as { user_id: string }
  if (repo.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  await supabase
    .from('reflections')
    .update({ share_token: null })
    .eq('id', reflectionId)

  return NextResponse.json({ success: true })
}
