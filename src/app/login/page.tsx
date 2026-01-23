'use client'

import { Github } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const handleGitHubLogin = async () => {
    const supabase = createClient()
    
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        scopes: 'repo read:user user:email',
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Link href="/" className="font-mono text-xl font-bold">
            jot
          </Link>
        </div>
      </header>

      {/* Login form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center mb-2">
            Welcome to jot
          </h1>
          <p className="text-[var(--muted)] text-center mb-8">
            Connect your GitHub to get started
          </p>

          <button
            onClick={handleGitHubLogin}
            className="w-full flex items-center justify-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Github className="w-5 h-5" />
            Continue with GitHub
          </button>

          <p className="text-xs text-[var(--muted)] text-center mt-6">
            We'll request access to your repositories so jot can read your commits.
            <br />
            We never write to your repos.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-6 py-4 text-sm text-[var(--muted)] text-center">
          7-day free trial, then $10/month
        </div>
      </footer>
    </div>
  )
}
