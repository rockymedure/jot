import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.session) {
      // Store the GitHub access token in the user's profile
      const { user } = data.session
      const providerToken = data.session.provider_token
      
      if (providerToken) {
        // Upsert the profile with GitHub token
        await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            name: user.user_metadata?.full_name || user.user_metadata?.name,
            avatar_url: user.user_metadata?.avatar_url,
            github_access_token: providerToken,
          }, {
            onConflict: 'id'
          })
      }
      
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/error`)
}
