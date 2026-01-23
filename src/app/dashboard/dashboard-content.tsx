'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { Github, Plus, Check, X, LogOut, FileText, Loader2 } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { createClient } from '@/lib/supabase/client'
import { fetchUserRepos, type GitHubRepo } from '@/lib/github'
import { format } from 'date-fns'

interface Profile {
  id: string
  email: string
  name: string
  avatar_url: string
  github_access_token: string
  subscription_status: string
  trial_ends_at: string
}

interface TrackedRepo {
  id: string
  github_repo_id: number
  name: string
  full_name: string
  is_active: boolean
}

interface Reflection {
  id: string
  date: string
  content: string
  commit_count: number
  repos: {
    name: string
    full_name: string
  }
}

interface Props {
  user: User
  profile: Profile | null
  trackedRepos: TrackedRepo[]
  reflections: Reflection[]
}

export function DashboardContent({ user, profile, trackedRepos, reflections: initialReflections }: Props) {
  const [showRepoSelector, setShowRepoSelector] = useState(false)
  const [availableRepos, setAvailableRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [repos, setRepos] = useState(trackedRepos)
  const [reflections, setReflections] = useState(initialReflections)
  const [generatingRepoId, setGeneratingRepoId] = useState<string | null>(null)

  const supabase = createClient()

  const loadRepos = async () => {
    if (!profile?.github_access_token) return
    
    setLoading(true)
    try {
      const repos = await fetchUserRepos(profile.github_access_token)
      setAvailableRepos(repos)
      setShowRepoSelector(true)
    } catch (error) {
      console.error('Failed to load repos:', error)
    } finally {
      setLoading(false)
    }
  }

  const addRepo = async (repo: GitHubRepo) => {
    const { data, error } = await supabase
      .from('repos')
      .insert({
        user_id: user.id,
        github_repo_id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        is_active: true,
      })
      .select()
      .single()

    if (!error && data) {
      setRepos([data, ...repos])
      setShowRepoSelector(false)
      
      // Generate first reflection immediately
      setGeneratingRepoId(data.id)
      try {
        const response = await fetch('/api/reflections/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoId: data.id })
        })
        
        const result = await response.json()
        
        if (result.success && result.reflectionId) {
          // Fetch the new reflection and add it to the list
          const { data: newReflection } = await supabase
            .from('reflections')
            .select('*, repos(name, full_name)')
            .eq('id', result.reflectionId)
            .single()
          
          if (newReflection) {
            setReflections([newReflection, ...reflections])
          }
        }
      } catch (error) {
        console.error('Failed to generate initial reflection:', error)
      } finally {
        setGeneratingRepoId(null)
      }
    }
  }

  const toggleRepo = async (repoId: string, isActive: boolean) => {
    await supabase
      .from('repos')
      .update({ is_active: !isActive })
      .eq('id', repoId)

    setRepos(repos.map(r => 
      r.id === repoId ? { ...r, is_active: !isActive } : r
    ))
  }

  const removeRepo = async (repoId: string) => {
    await supabase
      .from('repos')
      .delete()
      .eq('id', repoId)

    setRepos(repos.filter(r => r.id !== repoId))
  }

  const trackedRepoIds = new Set(repos.map(r => r.github_repo_id))

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="font-mono text-xl font-bold">
            jot
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--muted)]">
              {profile?.name || user.email}
            </span>
            <ThemeToggle />
            <form action="/auth/signout" method="POST">
              <button 
                type="submit"
                className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Subscription status */}
        {profile?.subscription_status === 'trial' && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-8">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              You're on a free trial. 
              {profile.trial_ends_at && (
                <> Ends {format(new Date(profile.trial_ends_at), 'MMM d, yyyy')}.</>
              )}
              {' '}
              <Link href="/settings" className="underline font-medium">
                Upgrade to Pro
              </Link>
            </p>
          </div>
        )}

        {/* Generating reflection banner */}
        {generatingRepoId && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">
                  Generating your first reflection...
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Analyzing your recent commits. This takes about 10-15 seconds.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Repos section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Tracked Repos</h2>
            <button
              onClick={loadRepos}
              disabled={loading}
              className="inline-flex items-center gap-2 text-sm bg-[var(--foreground)] text-[var(--background)] px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {loading ? 'Loading...' : 'Add repo'}
            </button>
          </div>

          {repos.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] rounded-lg p-10 text-center">
              <Github className="w-10 h-10 mx-auto mb-4 text-[var(--muted)]" />
              <p className="text-[var(--muted)] mb-4">
                No repos tracked yet. Add one to start getting reflections.
              </p>
              <button
                onClick={loadRepos}
                disabled={loading}
                className="inline-flex items-center gap-2 text-sm bg-[var(--foreground)] text-[var(--background)] px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Add your first repo
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {repos.map(repo => (
                <div
                  key={repo.id}
                  className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Github className="w-5 h-5 text-[var(--muted)]" />
                    <div>
                      <div className="font-medium">{repo.name}</div>
                      <div className="text-sm text-[var(--muted)]">{repo.full_name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleRepo(repo.id, repo.is_active)}
                      className={`px-3 py-1 text-sm rounded-full ${
                        repo.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {repo.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => removeRepo(repo.id)}
                      className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Repo selector modal */}
        {showRepoSelector && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
            <div className="bg-[var(--background)] rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-lg font-bold">Select a repository</h3>
                <button
                  onClick={() => setShowRepoSelector(false)}
                  className="text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-96">
                {availableRepos.map(repo => {
                  const isTracked = trackedRepoIds.has(repo.id)
                  return (
                    <button
                      key={repo.id}
                      onClick={() => {
                        if (!isTracked) {
                          addRepo(repo)
                        }
                      }}
                      disabled={isTracked}
                      className="w-full p-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900 border-b border-[var(--border)] last:border-0 disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{repo.name}</div>
                          <div className="text-sm text-[var(--muted)]">
                            {repo.full_name}
                            {repo.private && ' • Private'}
                          </div>
                        </div>
                        {isTracked && (
                          <Check className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Recent reflections */}
        <section>
          <h2 className="text-xl font-bold mb-6">Recent Reflections</h2>
          
          {reflections.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] rounded-lg p-10 text-center">
              <FileText className="w-10 h-10 mx-auto mb-4 text-[var(--muted)]" />
              <p className="text-[var(--muted)]">
                No reflections yet. jot will email you tonight after you make some commits.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reflections.map(reflection => (
                <Link
                  key={reflection.id}
                  href={`/reflections/${reflection.id}`}
                  className="block p-4 border border-[var(--border)] rounded-lg hover:border-[var(--foreground)] transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">
                      {format(new Date(reflection.date), 'EEEE, MMMM d')}
                    </span>
                    <span className="text-sm text-[var(--muted)]">
                      {reflection.commit_count} commits
                    </span>
                  </div>
                  <div className="text-sm text-[var(--muted)]">
                    {reflection.repos?.full_name}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
