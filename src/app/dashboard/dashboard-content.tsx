'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { Github, Plus, Check, X, LogOut, Loader2 } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { createClient } from '@/lib/supabase/client'
import { fetchUserRepos, type GitHubRepo } from '@/lib/github'
import { format } from 'date-fns'
import { parseDateLocal } from '@/lib/utils'

interface Profile {
  id: string
  email: string
  name: string
  avatar_url: string
  github_access_token: string
  subscription_status: string
  trial_ends_at: string
  timezone?: string
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
  repo_id: string
  date: string
  content: string
  summary: string | null
  commit_count: number
  repos: {
    name: string
    full_name: string
  } | null
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
  const [generatingRepoIds, setGeneratingRepoIds] = useState<Set<string>>(new Set())
  const [generationMessage, setGenerationMessage] = useState<string | null>(null)
  const [thinkingContent, setThinkingContent] = useState<string | null>(null)

  const supabase = createClient()

  // Auto-detect and save browser timezone on first visit
  useEffect(() => {
    const detectAndSaveTimezone = async () => {
      // Only run if profile exists and timezone isn't already set
      if (!profile || profile.timezone) return
      
      try {
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (browserTimezone) {
          await supabase
            .from('profiles')
            .update({ timezone: browserTimezone })
            .eq('id', user.id)
        }
      } catch (error) {
        console.error('Failed to detect/save timezone:', error)
      }
    }
    
    detectAndSaveTimezone()
  }, [profile, user.id, supabase])

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
      
      // Create webhook for real-time push notifications
      fetch('/api/repos/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: data.id })
      }).catch(err => console.error('Failed to create webhook:', err))
      
      // Generate first reflection immediately using streaming endpoint
      setGeneratingRepoIds(prev => new Set(prev).add(data.id))
      setGenerationMessage(null)
      setThinkingContent('')
      
      try {
        const response = await fetch('/api/reflections/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoId: data.id, isInitial: true })
        })
        
        // Check if it's a streaming response
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
          const reader = response.body?.getReader()
          if (!reader) throw new Error('No reader available')
          
          const decoder = new TextDecoder()
          let thinkingBuffer = ''
          
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            const text = decoder.decode(value, { stream: true })
            const lines = text.split('\n')
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6))
                  if (event.type === 'thinking') {
                    thinkingBuffer += event.content
                    setThinkingContent(thinkingBuffer)
                  } else if (event.type === 'done') {
                    // Fetch the new reflection after streaming completes
                    await new Promise(resolve => setTimeout(resolve, 500))
                    
                    const { data: repoReflections } = await supabase
                      .from('reflections')
                      .select('*, repos(name, full_name)')
                      .eq('repo_id', data.id)
                      .order('date', { ascending: false })
                      .limit(1)
                    
                    if (repoReflections?.[0]) {
                      setReflections(prev => [repoReflections[0], ...prev.filter(r => r.id !== repoReflections[0].id)])
                    }
                  }
                } catch (parseError) {
                  console.warn('[dashboard] Failed to parse stream event:', line, parseError)
                }
              }
            }
          }
        } else {
          // Handle error response
          const result = await response.json()
          if (result.noCommits) {
            setGenerationMessage('No commits found in the last 30 days on any branch. Start coding and jot will send your first reflection tonight!')
          } else if (result.error) {
            setGenerationMessage(`Failed to generate: ${result.error}`)
          }
        }
      } catch (error) {
        console.error('Failed to generate initial reflection:', error)
        setGenerationMessage('Failed to generate reflection. Please try again.')
      } finally {
        setGeneratingRepoIds(prev => {
          const next = new Set(prev)
          next.delete(data.id)
          return next
        })
        // Clear thinking after a delay
        setTimeout(() => setThinkingContent(null), 3000)
      }
    }
  }

  const removeRepo = async (repoId: string) => {
    // Delete webhook first
    fetch(`/api/repos/webhook?repoId=${repoId}`, {
      method: 'DELETE'
    }).catch(err => console.error('Failed to delete webhook:', err))
    
    await supabase
      .from('repos')
      .delete()
      .eq('id', repoId)

    setRepos(repos.filter(r => r.id !== repoId))
  }

  const generateReflection = async (repoId: string, regenerate: boolean = true) => {
    if (generatingRepoIds.has(repoId)) return // Already generating
    setGeneratingRepoIds(prev => new Set(prev).add(repoId))
    setGenerationMessage(null)
    setThinkingContent('')
    
    try {
      const response = await fetch('/api/reflections/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId, regenerate })
      })
      
      // Check if it's a streaming response
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader available')
        
        const decoder = new TextDecoder()
        let thinkingBuffer = ''
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const text = decoder.decode(value, { stream: true })
          const lines = text.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6))
                if (event.type === 'thinking') {
                  thinkingBuffer += event.content
                  setThinkingContent(thinkingBuffer)
                } else if (event.type === 'done') {
                  // Fetch the new reflection after streaming completes
                  // Small delay to let the DB save complete
                  await new Promise(resolve => setTimeout(resolve, 500))
                  
                  const { data: repoReflections } = await supabase
                    .from('reflections')
                    .select('*, repos(name, full_name)')
                    .eq('repo_id', repoId)
                    .order('date', { ascending: false })
                    .limit(1)
                  
                  if (repoReflections?.[0]) {
                    setReflections(prev => [repoReflections[0], ...prev.filter(r => r.id !== repoReflections[0].id)])
                  }
                }
              } catch (parseError) {
                console.warn('[dashboard] Failed to parse stream event:', line, parseError)
              }
            }
          }
        }
      } else {
        // Handle error response
        const result = await response.json()
        if (result.noCommits) {
          setGenerationMessage('No new commits since last reflection.')
        } else if (result.error) {
          setGenerationMessage(`Failed to generate: ${result.error}`)
        }
      }
    } catch (error) {
      console.error('Failed to generate reflection:', error)
      setGenerationMessage('Failed to generate reflection. Please try again.')
    } finally {
      setGeneratingRepoIds(prev => {
        const next = new Set(prev)
        next.delete(repoId)
        return next
      })
      // Clear thinking after a delay
      setTimeout(() => setThinkingContent(null), 3000)
    }
  }

  const trackedRepoIds = new Set(repos.map(r => r.github_repo_id))
  
  // Group reflections by repo
  const getRepoReflections = (repoId: string) => {
    return reflections
      .filter(r => r.repo_id === repoId)
      .slice(0, 5) // Show max 5 recent reflections per repo
  }

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

        {/* Generating reflection banner with live thinking */}
        {generatingRepoIds.size > 0 && (
          <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-8">
            <div className="flex items-start gap-3">
              <Loader2 className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-spin flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-purple-800 dark:text-purple-200 mb-2">
                  jot is thinking...
                </p>
                {thinkingContent ? (
                  <div className="text-sm text-purple-700 dark:text-purple-300 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto bg-purple-100 dark:bg-purple-900 rounded p-3">
                    {thinkingContent}
                  </div>
                ) : (
                  <p className="text-sm text-purple-700 dark:text-purple-300">
                    Fetching commits and analyzing your work...
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Thinking content display after completion */}
        {thinkingContent && generatingRepoIds.size === 0 && (
          <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="font-medium text-purple-800 dark:text-purple-200 mb-2">
                  jot's thinking process
                </p>
                <p className="text-sm text-purple-700 dark:text-purple-300 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                  {thinkingContent}
                </p>
              </div>
              <button 
                onClick={() => setThinkingContent(null)}
                className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}


        {/* Generation result message */}
        {generationMessage && generatingRepoIds.size === 0 && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-8">
            <div className="flex items-center justify-between">
              <p className="text-amber-800 dark:text-amber-200">{generationMessage}</p>
              <button 
                onClick={() => setGenerationMessage(null)}
                className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Projects section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Projects</h2>
            <button
              onClick={loadRepos}
              disabled={loading}
              className="inline-flex items-center gap-2 text-sm bg-[var(--foreground)] text-[var(--background)] px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {loading ? 'Loading...' : 'Add project'}
            </button>
          </div>

          {repos.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] rounded-lg p-10 text-center">
              <Github className="w-10 h-10 mx-auto mb-4 text-[var(--muted)]" />
              <p className="text-[var(--muted)] mb-4">
                No projects tracked yet. Add one to start getting reflections.
              </p>
              <button
                onClick={loadRepos}
                disabled={loading}
                className="inline-flex items-center gap-2 text-sm bg-[var(--foreground)] text-[var(--background)] px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Add your first project
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {repos.map(repo => {
                const repoReflections = getRepoReflections(repo.id)
                return (
                  <div
                    key={repo.id}
                    className="border border-[var(--border)] rounded-lg overflow-hidden"
                  >
                    {/* Repo header */}
                    <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-900 border-b border-[var(--border)]">
                      <div className="flex items-center gap-3">
                        <Github className="w-5 h-5 text-[var(--muted)]" />
                        <div>
                          <div className="font-medium">{repo.name}</div>
                          <div className="text-sm text-[var(--muted)]">{repo.full_name}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => generateReflection(repo.id)}
                          disabled={generatingRepoIds.has(repo.id)}
                          className="px-3 py-1 text-sm border border-[var(--border)] bg-[var(--background)] rounded-lg hover:bg-[var(--foreground)] hover:text-[var(--background)] transition-colors disabled:opacity-50"
                        >
                          {generatingRepoIds.has(repo.id) ? 'Reflecting...' : 'Reflect'}
                        </button>
                        <button
                          onClick={() => removeRepo(repo.id)}
                          className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors"
                          title="Remove project"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Reflections list */}
                    {repoReflections.length === 0 ? (
                      <div className="p-6 text-center">
                        <p className="text-sm text-[var(--muted)]">
                          No reflections yet. Click "Reflect" or wait for tonight's email.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border)]">
                        {repoReflections.map(reflection => (
                          <Link
                            key={reflection.id}
                            href={`/reflections/${reflection.id}`}
                            className="block p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">
                                {format(parseDateLocal(reflection.date), 'EEEE, MMMM d')}
                              </span>
                              <span className="text-xs text-[var(--muted)]">
                                {reflection.commit_count} commits
                              </span>
                            </div>
                            {reflection.summary && (
                              <p className="text-sm text-[var(--muted)]">
                                {reflection.summary}
                              </p>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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

      </div>
    </div>
  )
}