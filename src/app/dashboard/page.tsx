import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardContent } from './dashboard-content'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Get user's profile with GitHub token
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Get user's tracked repos
  const { data: trackedRepos } = await supabase
    .from('repos')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Get recent reflections - use repo IDs from tracked repos for reliable filtering
  const repoIds = (trackedRepos || []).map(r => r.id)
  const { data: reflections } = repoIds.length > 0 
    ? await supabase
        .from('reflections')
        .select('*, repos(name, full_name)')
        .in('repo_id', repoIds)
        .order('date', { ascending: false })
        .limit(10)
    : { data: [] }

  return (
    <DashboardContent 
      user={user}
      profile={profile}
      trackedRepos={trackedRepos || []}
      reflections={reflections || []}
    />
  )
}
