import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  const supabase = await createClient()
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      scopes: 'repo read:user user:email',
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  return NextResponse.redirect(data.url)
}
