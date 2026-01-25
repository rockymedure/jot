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

  // Get reflections for all tracked repos (we'll group them client-side)
  const repoIds = (trackedRepos || []).map(r => r.id)
  const { data: rawReflections } = repoIds.length > 0 
    ? await supabase
        .from('reflections')
        .select('id, repo_id, date, content, summary, commit_count, repos(name, full_name)')
        .in('repo_id', repoIds)
        .order('date', { ascending: false })
        .limit(50) // Fetch more since we show per-repo now
    : { data: [] }
  
  // Transform reflections to match expected interface (repos is returned as array, we want object)
  const reflections = (rawReflections || []).map(r => ({
    ...r,
    repos: Array.isArray(r.repos) ? r.repos[0] : r.repos
  }))

  return (
    <DashboardContent 
      user={user}
      profile={profile}
      trackedRepos={trackedRepos || []}
      reflections={reflections || []}
    />
  )
}
