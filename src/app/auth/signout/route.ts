import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

export async function POST() {
  const supabase = await createClient()
  
  await supabase.auth.signOut()
  
  // Get origin from request headers (more reliable than request.url)
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  
  return NextResponse.redirect(`${protocol}://${host}/`)
}
