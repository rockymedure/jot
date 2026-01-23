'use client'

import { useState } from 'react'
import { Search, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface ReviewButtonProps {
  reflectionId: string
  existingReview?: string | null
}

export function ReviewButton({ reflectionId, existingReview }: ReviewButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [review, setReview] = useState<string | null>(existingReview || null)
  const [error, setError] = useState<string | null>(null)

  const handleReview = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflectionId })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to generate review')
      }

      setReview(data.review)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  if (review) {
    return (
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <h2 className="text-xl font-semibold">Deep Review</h2>
        </div>
        <div className="prose bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-8">
          <ReviewContent content={review} />
        </div>
      </div>
    )
  }

  return (
    <div className="mt-8 border-t border-[var(--border)] pt-8">
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 font-medium">Review failed</p>
            <p className="text-sm text-[var(--muted)]">{error}</p>
          </div>
        </div>
      )}
      
      <div className="text-center">
        <p className="text-[var(--muted)] mb-4">
          Want a deeper look at this work? Jot can analyze the actual code changes.
        </p>
        <button
          onClick={handleReview}
          disabled={isLoading}
          className="inline-flex items-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Reviewing code...
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              Review this work
            </>
          )}
        </button>
        {isLoading && (
          <p className="text-sm text-[var(--muted)] mt-3">
            This may take a minute. Jot is cloning the repo and analyzing your code...
          </p>
        )}
      </div>
    </div>
  )
}

function ReviewContent({ content }: { content: string }) {
  // Simple markdown rendering
  const html = content
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-[var(--border)] px-1 py-0.5 rounded text-sm">$1</code>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-[var(--border)] p-4 rounded-lg overflow-x-auto my-4"><code>$2</code></pre>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc mb-4">$&</ul>')
    .replace(/^(?!<[hul]|<li|<pre|<code)(.+)$/gm, '<p class="mb-4">$1</p>')
    .replace(/<\/ul>\n<ul[^>]*>/g, '')

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
