import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const DEMO_EMAIL = 'demo@jotgrowsideas.com'
const DEMO_PASSWORD = 'demopassword123'

/**
 * Dev-only route to sign in as demo user
 * Only works in development mode
 */
export async function GET() {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Create admin client
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  try {
    // Check if demo user exists by listing users
    const { data: users } = await adminClient.auth.admin.listUsers()
    const existingUser = users?.users?.find(u => u.email === DEMO_EMAIL)
    
    let userId: string
    
    if (!existingUser) {
      // Create demo user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { name: 'Demo User' }
      })
      
      if (createError || !newUser.user) {
        console.error('Failed to create demo user:', createError)
        return NextResponse.json({ error: createError?.message || 'Failed to create user' }, { status: 500 })
      }
      
      userId = newUser.user.id
      
      // Create profile for the new user
      await adminClient.from('profiles').upsert({
        id: userId,
        email: DEMO_EMAIL,
        name: 'Demo User',
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        timezone: 'America/New_York'
      })
      
      // Create demo repos
      await adminClient.from('repos').upsert([
        { id: '11111111-1111-1111-1111-111111111111', user_id: userId, github_repo_id: 12345678, name: 'startup-app', full_name: 'demo-user/startup-app', is_active: true },
        { id: '22222222-2222-2222-2222-222222222222', user_id: userId, github_repo_id: 87654321, name: 'landing-page', full_name: 'demo-user/landing-page', is_active: true },
        { id: '33333333-3333-3333-3333-333333333333', user_id: userId, github_repo_id: 11223344, name: 'api-backend', full_name: 'demo-user/api-backend', is_active: false }
      ])
      
      // Create demo reflections
      await adminClient.from('reflections').upsert([
        {
          id: 'aaaa1111-1111-1111-1111-111111111111',
          repo_id: '11111111-1111-1111-1111-111111111111',
          date: new Date().toISOString().split('T')[0],
          content: '## What You Did\n\nYou shipped the authentication flow today. OAuth with GitHub, session management, and protected routes. 12 commits focused on a single feature.\n\n## Observations\n\nGood focus today. You didn\'t get distracted by UI polish or premature optimization. The auth flow works, it\'s secure, and you moved on.\n\n## Questions for Tomorrow\n\n1. What\'s the next critical path feature after auth?\n2. Are you going to add email/password as a fallback?',
          summary: 'Shipped auth flow with good focus',
          commit_count: 12
        },
        {
          id: 'aaaa2222-2222-2222-2222-222222222222',
          repo_id: '11111111-1111-1111-1111-111111111111',
          date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          content: '## What You Did\n\nDatabase schema day. You set up Supabase, created 4 tables, added RLS policies, and wrote a migration script. 8 commits.\n\n## Observations\n\nSolid foundation work. RLS policies are often skipped by solo founders who "will add security later." You didn\'t skip it. Good.\n\n## Questions for Tomorrow\n\n1. Do you have a backup strategy for the database?\n2. What\'s your plan for database migrations in production?',
          summary: 'Set up database schema with RLS',
          commit_count: 8
        }
      ])
    } else {
      userId = existingUser.id
      // Update password
      await adminClient.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD })
    }

    // Now sign in with the credentials
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    })

    if (error) {
      console.error('Dev login error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Redirect to dashboard
    return NextResponse.redirect(new URL('/dashboard', 'http://localhost:3000'))
  } catch (err) {
    console.error('Dev login error:', err)
    return NextResponse.json({ error: 'Failed to create session', details: String(err) }, { status: 500 })
  }
}
