import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  let next = searchParams.get('next') ?? '/dashboard'
  
  // Prevent open redirect - only allow relative paths starting with /
  if (!next.startsWith('/') || next.startsWith('//')) {
    next = '/dashboard'
  }

  // Get origin from request headers (more reliable than request.url behind proxies)
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const origin = `${protocol}://${host}`

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
