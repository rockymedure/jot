import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

// Allowed hosts for OAuth redirects
const ALLOWED_HOSTS = ['jotgrowsideas.com', 'www.jotgrowsideas.com', 'localhost:3000']

function isAllowedHost(host: string): boolean {
  // Exact matches
  if (ALLOWED_HOSTS.includes(host)) return true
  // Railway deployments
  if (host.endsWith('.railway.app') || host.endsWith('.up.railway.app')) return true
  return false
}

export async function GET() {
  // Get origin from request headers (more reliable than request.url behind proxies)
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  
  // Validate host against allowlist to prevent open redirect attacks
  if (!isAllowedHost(host)) {
    console.error(`[auth/github] Invalid host header: ${host}`)
    return NextResponse.json({ error: 'Invalid host' }, { status: 400 })
  }
  
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const origin = `${protocol}://${host}`
  
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
