import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'

// Admin emails that can access this page
const ADMIN_EMAILS = ['rockymedure@gmail.com', 'demo@jotgrowsideas.com']

export default async function AdminPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single()

  if (!profile || !ADMIN_EMAILS.includes(profile.email)) {
    redirect('/dashboard')
  }

  // Use service client for admin queries (bypasses RLS)
  const serviceClient = createServiceClient()

  // Get all users with their stats
  const { data: users } = await serviceClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  // Get all repos
  const { data: repos } = await serviceClient
    .from('repos')
    .select('*')
    .order('last_push_at', { ascending: false })

  // Get all reflections
  const { data: reflections } = await serviceClient
    .from('reflections')
    .select('*')
    .order('created_at', { ascending: false })

  // Calculate overview stats
  const totalUsers = users?.length || 0
  const activeSubscriptions = users?.filter(u => u.subscription_status === 'active').length || 0
  const trialUsers = users?.filter(u => u.subscription_status === 'trial').length || 0
  const totalReflections = reflections?.length || 0
  const totalCommits = reflections?.reduce((sum, r) => sum + (r.commit_count || 0), 0) || 0

  // Format relative time
  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Calculate next reflection for a user
  const getNextReflection = (userId: string) => {
    const userRepos = (repos || []).filter(r => r.user_id === userId)
    const repoIds = userRepos.map(r => r.id)
    const userReflections = (reflections || []).filter(r => repoIds.includes(r.repo_id))
    
    const lastPush = userRepos
      .filter(r => r.last_push_at)
      .sort((a, b) => new Date(b.last_push_at).getTime() - new Date(a.last_push_at).getTime())[0]
    
    const lastReflection = userReflections
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

    const hasActiveRepos = userRepos.some(r => r.is_active)
    const lastReflectionDate = lastReflection?.date || null
    
    if (hasActiveRepos && lastPush?.last_push_at) {
      const lastPushDate = new Date(lastPush.last_push_at)
      const lastReflDate = lastReflectionDate ? new Date(lastReflectionDate) : null
      const hasNewCommits = !lastReflDate || lastPushDate > lastReflDate
      
      if (hasNewCommits) {
        return { text: 'Tonight 9 PM', color: 'text-green-500' }
      }
    }
    
    if (!hasActiveRepos) {
      return { text: 'No repos', color: 'text-[var(--muted)]' }
    }
    
    return { text: 'Waiting', color: 'text-[var(--muted)]' }
  }

  // Filter out demo account for display
  const realUsers = (users || []).filter(u => u.email !== 'demo@jotgrowsideas.com')

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/dashboard" className="text-2xl font-bold text-[var(--foreground)]">jot</a>
              <span className="text-xs text-[var(--muted)] bg-[var(--background)] px-2 py-1 rounded font-medium">ADMIN</span>
            </div>
            <a href="/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
              ← Dashboard
            </a>
          </div>
          
          {/* Compact Stats Bar */}
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-[var(--foreground)]">{totalUsers}</span>
              <span className="text-[var(--muted)]">users</span>
            </div>
            <div className="text-[var(--border)]">|</div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-green-500">{activeSubscriptions}</span>
              <span className="text-[var(--muted)]">paid</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-yellow-500">{trialUsers}</span>
              <span className="text-[var(--muted)]">trial</span>
            </div>
            <div className="text-[var(--border)]">|</div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--foreground)]">{totalReflections}</span>
              <span className="text-[var(--muted)]">reflections</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--foreground)]">{totalCommits}</span>
              <span className="text-[var(--muted)]">commits</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Customer Cards */}
        <div className="space-y-6">
          {realUsers.map(owner => {
            const ownerRepos = (repos || []).filter(r => r.user_id === owner.id && r.is_active)
            const repoIds = ownerRepos.map(r => r.id)
            const ownerReflections = (reflections || []).filter(r => repoIds.includes(r.repo_id))
            const ownerCommits = ownerReflections.reduce((sum, r) => sum + (r.commit_count || 0), 0)
            const nextReflection = getNextReflection(owner.id)
            
            const lastPush = ownerRepos
              .filter(r => r.last_push_at)
              .sort((a, b) => new Date(b.last_push_at).getTime() - new Date(a.last_push_at).getTime())[0]
            
            return (
              <div key={owner.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                {/* Customer Header */}
                <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--background)]/50">
                  <div className="flex items-center gap-4">
                    {owner.avatar_url ? (
                      <img src={owner.avatar_url} alt="" className="w-12 h-12 rounded-full" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-lg font-medium">
                        {owner.email?.[0]?.toUpperCase()}
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-[var(--foreground)] truncate">
                          {owner.name || owner.email?.split('@')[0]}
                        </h3>
                        <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                          owner.subscription_status === 'active' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                        }`}>
                          {owner.subscription_status}
                        </span>
                      </div>
                      <div className="text-sm text-[var(--muted)]">{owner.email}</div>
                    </div>
                    
                    {/* Quick Stats */}
                    <div className="hidden sm:flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="font-semibold text-[var(--foreground)]">{ownerRepos.length}</div>
                        <div className="text-xs text-[var(--muted)]">repos</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-[var(--foreground)]">{ownerReflections.length}</div>
                        <div className="text-xs text-[var(--muted)]">reflections</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-[var(--foreground)]">{ownerCommits}</div>
                        <div className="text-xs text-[var(--muted)]">commits</div>
                      </div>
                      <div className="text-center border-l border-[var(--border)] pl-6">
                        <div className={`font-semibold ${nextReflection.color}`}>{nextReflection.text}</div>
                        <div className="text-xs text-[var(--muted)]">next</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Meta row */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-[var(--muted)]">
                    <span>Joined {new Date(owner.created_at).toLocaleDateString()}</span>
                    <span>·</span>
                    <span>Last push {formatRelativeTime(lastPush?.last_push_at)}</span>
                    <span>·</span>
                    <span>{owner.timezone || 'America/New_York'}</span>
                  </div>
                </div>
                
                {/* Projects */}
                {ownerRepos.length > 0 ? (
                  <div className="divide-y divide-[var(--border)]">
                    {ownerRepos.map(repo => {
                      const repoReflections = ownerReflections
                        .filter(r => r.repo_id === repo.id)
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      const latestReflection = repoReflections[0]
                      const repoCommits = repoReflections.reduce((sum, r) => sum + (r.commit_count || 0), 0)
                      
                      return (
                        <div key={repo.id} className="px-6 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <a 
                                  href={`https://github.com/${repo.full_name}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
                                >
                                  {repo.name}
                                </a>
                                <span className="text-xs text-[var(--muted)]">
                                  {repoReflections.length} reflections · {repoCommits} commits
                                </span>
                              </div>
                              
                              {latestReflection?.summary ? (
                                <p className="text-sm text-[var(--muted)] leading-relaxed">
                                  {latestReflection.summary}
                                </p>
                              ) : (
                                <p className="text-sm text-[var(--muted)] italic">Waiting for first reflection...</p>
                              )}
                            </div>
                            
                            {latestReflection && (
                              <div className="shrink-0 text-right">
                                <div className="text-xs font-medium text-[var(--foreground)]">
                                  {new Date(latestReflection.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                                {latestReflection.review_content && (
                                  <div className="text-xs text-green-500 mt-0.5">reviewed</div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Show last 2 more reflections if they exist */}
                          {repoReflections.length > 1 && (
                            <div className="mt-3 pt-3 border-t border-[var(--border)] border-dashed">
                              <div className="space-y-2">
                                {repoReflections.slice(1, 3).map(r => (
                                  <div key={r.id} className="flex items-start gap-3 text-xs">
                                    <span className="shrink-0 text-[var(--muted)] w-12">
                                      {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                    <span className="text-[var(--muted)] line-clamp-1">
                                      {r.summary || `${r.commit_count} commits`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-6 py-8 text-center text-sm text-[var(--muted)]">
                    No active repos yet
                  </div>
                )}
              </div>
            )
          })}
        </div>
        
        {realUsers.length === 0 && (
          <div className="text-center py-12 text-[var(--muted)]">
            No customers yet
          </div>
        )}
      </main>
    </div>
  )
}
