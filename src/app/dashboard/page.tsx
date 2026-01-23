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

  // Get recent reflections
  const { data: reflections } = await supabase
    .from('reflections')
    .select('*, repos(name, full_name)')
    .eq('repos.user_id', user.id)
    .order('date', { ascending: false })
    .limit(10)

  return (
    <DashboardContent 
      user={user}
      profile={profile}
      trackedRepos={trackedRepos || []}
      reflections={reflections || []}
    />
  )
}
