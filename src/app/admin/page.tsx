import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'

// Admin emails that can access this page
const ADMIN_EMAILS = ['rockymedure@gmail.com', 'demo@jotgrowsideas.com']

interface UserStats {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  subscription_status: string
  trial_ends_at: string
  timezone: string
  created_at: string
  repos_count: number
  reflections_count: number
  reviews_count: number
  last_push: string | null
  last_reflection: string | null
  last_reflection_date: string | null
  next_reflection: string | null
}

interface DailyActivity {
  date: string
  pushes: number
  reflections: number
}

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

  // Calculate user stats
  const userStats: UserStats[] = (users || []).map(u => {
    const userRepos = (repos || []).filter(r => r.user_id === u.id)
    const repoIds = userRepos.map(r => r.id)
    const userReflections = (reflections || []).filter(r => repoIds.includes(r.repo_id))
    const userReviews = userReflections.filter(r => r.review_content)
    
    const lastPush = userRepos
      .filter(r => r.last_push_at)
      .sort((a, b) => new Date(b.last_push_at).getTime() - new Date(a.last_push_at).getTime())[0]
    
    const lastReflection = userReflections
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

    // Calculate next reflection time
    // Reflections trigger at 9 PM in user's timezone if they have commits since last reflection
    const userTimezone = u.timezone || 'America/New_York'
    const now = new Date()
    const hasActiveRepos = userRepos.some(r => r.is_active)
    const lastReflectionDate = lastReflection?.date || null
    
    let nextReflection: string | null = null
    if (hasActiveRepos && lastPush?.last_push_at) {
      const lastPushDate = new Date(lastPush.last_push_at)
      const lastReflDate = lastReflectionDate ? new Date(lastReflectionDate) : null
      
      // Check if there are commits since last reflection
      const hasNewCommits = !lastReflDate || lastPushDate > lastReflDate
      
      if (hasNewCommits) {
        // Next reflection is at 9 PM in user's timezone
        // Create a date for today at 9 PM in their timezone
        const today9pm = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }))
        today9pm.setHours(21, 0, 0, 0)
        
        // Convert back to UTC for comparison
        const today9pmUtc = new Date(today9pm.toLocaleString('en-US', { timeZone: 'UTC' }))
        
        if (now < today9pmUtc) {
          nextReflection = 'Tonight 9 PM'
        } else {
          nextReflection = 'Tomorrow 9 PM'
        }
      } else {
        nextReflection = 'Waiting for commits'
      }
    } else if (!hasActiveRepos) {
      nextReflection = 'No active repos'
    } else {
      nextReflection = 'Waiting for commits'
    }

    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatar_url: u.avatar_url,
      subscription_status: u.subscription_status,
      trial_ends_at: u.trial_ends_at,
      timezone: u.timezone,
      created_at: u.created_at,
      repos_count: userRepos.filter(r => r.is_active).length,
      reflections_count: userReflections.length,
      reviews_count: userReviews.length,
      last_push: lastPush?.last_push_at || null,
      last_reflection: lastReflection?.created_at || null,
      last_reflection_date: lastReflectionDate,
      next_reflection: nextReflection,
    }
  })

  // Calculate overview stats
  const totalUsers = users?.length || 0
  const activeSubscriptions = users?.filter(u => u.subscription_status === 'active').length || 0
  const trialUsers = users?.filter(u => u.subscription_status === 'trial').length || 0
  const totalRepos = repos?.filter(r => r.is_active).length || 0
  const totalReflections = reflections?.length || 0
  const totalReviews = reflections?.filter(r => r.review_content).length || 0
  const totalCommits = reflections?.reduce((sum, r) => sum + (r.commit_count || 0), 0) || 0

  // Activity in last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const recentReflections = reflections?.filter(r => new Date(r.created_at) > sevenDaysAgo).length || 0
  const recentPushes = repos?.filter(r => r.last_push_at && new Date(r.last_push_at) > sevenDaysAgo).length || 0

  // Daily activity for the last 14 days
  const dailyActivity: DailyActivity[] = []
  for (let i = 13; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    const dayReflections = reflections?.filter(r => r.date === dateStr).length || 0
    const dayPushes = repos?.filter(r => 
      r.last_push_at && r.last_push_at.startsWith(dateStr)
    ).length || 0

    dailyActivity.push({
      date: dateStr,
      pushes: dayPushes,
      reflections: dayReflections,
    })
  }

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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    })
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-2xl font-bold text-[var(--foreground)]">jot</a>
            <span className="text-sm text-[var(--muted)] bg-[var(--background)] px-2 py-1 rounded">admin</span>
          </div>
          <a href="/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            ← Back to Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Overview Stats */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-2xl font-bold text-[var(--foreground)]">{totalUsers}</div>
              <div className="text-sm text-[var(--muted)]">Total Users</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-2xl font-bold text-green-500">{activeSubscriptions}</div>
              <div className="text-sm text-[var(--muted)]">Paid</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-500">{trialUsers}</div>
              <div className="text-sm text-[var(--muted)]">Trial</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-2xl font-bold text-[var(--foreground)]">{totalRepos}</div>
              <div className="text-sm text-[var(--muted)]">Active Repos</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-2xl font-bold text-[var(--foreground)]">{totalReflections}</div>
              <div className="text-sm text-[var(--muted)]">Reflections</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-2xl font-bold text-[var(--foreground)]">{totalReviews}</div>
              <div className="text-sm text-[var(--muted)]">Deep Reviews</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-2xl font-bold text-[var(--foreground)]">{totalCommits}</div>
              <div className="text-sm text-[var(--muted)]">Commits Tracked</div>
            </div>
          </div>
        </section>

        {/* Activity Chart */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Last 14 Days</h2>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
            <div className="flex items-end gap-2 h-32">
              {dailyActivity.map((day, i) => {
                const maxVal = Math.max(...dailyActivity.map(d => d.reflections), 1)
                const height = (day.reflections / maxVal) * 100
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div 
                      className="w-full bg-[var(--accent)] rounded-t transition-all"
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${day.date}: ${day.reflections} reflections`}
                    />
                    <span className="text-xs text-[var(--muted)] rotate-45 origin-left whitespace-nowrap">
                      {formatDate(day.date)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-8 text-sm text-[var(--muted)]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[var(--accent)] rounded" />
                <span>Reflections</span>
              </div>
              <span>|</span>
              <span>{recentReflections} reflections this week</span>
              <span>|</span>
              <span>{recentPushes} repos with pushes this week</span>
            </div>
          </div>
        </section>

        {/* Users Table */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Users</h2>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--background)]">
                <tr className="text-left text-sm text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-center">Repos</th>
                  <th className="px-4 py-3 font-medium text-center">Reflections</th>
                  <th className="px-4 py-3 font-medium text-center">Reviews</th>
                  <th className="px-4 py-3 font-medium">Last Push</th>
                  <th className="px-4 py-3 font-medium">Last Reflection</th>
                  <th className="px-4 py-3 font-medium">Next Reflection</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {userStats.map(u => (
                  <tr key={u.id} className="hover:bg-[var(--background)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? (
                          <img 
                            src={u.avatar_url} 
                            alt="" 
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-sm font-medium">
                            {u.email?.[0]?.toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-[var(--foreground)]">
                            {u.name || u.email?.split('@')[0]}
                          </div>
                          <div className="text-xs text-[var(--muted)]">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        u.subscription_status === 'active' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : u.subscription_status === 'trial'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                      }`}>
                        {u.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-[var(--foreground)]">
                      {u.repos_count}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-[var(--foreground)]">
                      {u.reflections_count}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-[var(--foreground)]">
                      {u.reviews_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--muted)]">
                      {formatRelativeTime(u.last_push)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--muted)]">
                      {formatRelativeTime(u.last_reflection)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`${
                        u.next_reflection === 'Tonight 9 PM' 
                          ? 'text-green-500 font-medium'
                          : u.next_reflection === 'Tomorrow 9 PM'
                          ? 'text-blue-500'
                          : 'text-[var(--muted)]'
                      }`}>
                        {u.next_reflection}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--muted)]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Reflections */}
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Recent Reflections</h2>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
            {(reflections || []).slice(0, 10).map(r => {
              const repo = repos?.find(repo => repo.id === r.repo_id)
              const owner = users?.find(u => u.id === repo?.user_id)
              return (
                <div key={r.id} className="p-4 hover:bg-[var(--background)] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {repo?.name}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        by {owner?.email?.split('@')[0]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                      <span>{r.commit_count} commits</span>
                      {r.review_content && (
                        <span className="text-green-500">✓ reviewed</span>
                      )}
                      <span>{r.date}</span>
                    </div>
                  </div>
                  {r.summary && (
                    <p className="text-sm text-[var(--muted)] line-clamp-2">{r.summary}</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
