import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { parseDateLocal } from '@/lib/utils'
import { ShareButton } from '@/components/share-button'
import { ReviewButton } from '@/components/review-button'
import DOMPurify from 'isomorphic-dompurify'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ReflectionPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Get reflection with repo info
  const { data: reflection, error } = await supabase
    .from('reflections')
    .select(`
      *,
      share_token,
      repos(
        name,
        full_name,
        user_id
      )
    `)
    .eq('id', id)
    .single()

  if (error || !reflection) {
    notFound()
  }

  // Verify ownership
  const repo = reflection.repos as { name: string; full_name: string; user_id: string }
  if (repo.user_id !== user.id) {
    notFound()
  }

  const formattedDate = format(parseDateLocal(reflection.date), 'EEEE, MMMM d, yyyy')

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard"
              className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Link href="/dashboard" className="font-mono text-xl font-bold">
              jot
            </Link>
          </div>
          <ShareButton 
            reflectionId={reflection.id} 
            initialShareToken={reflection.share_token} 
          />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Reflection header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{formattedDate}</h1>
          <div className="flex items-center gap-3 text-[var(--muted)]">
            <span>{repo.full_name}</span>
            <span>•</span>
            <span>{reflection.commit_count} commits</span>
          </div>
        </div>

        {/* Comic strip */}
        {reflection.comic_url ? (
          <div className="mb-8">
            <img 
              src={reflection.comic_url} 
              alt={`Comic strip for ${formattedDate}`}
              className="w-full rounded-lg"
            />
          </div>
        ) : (
          <ComicPlaceholder createdAt={reflection.created_at} />
        )}

        {/* Reflection content */}
        <div className="prose bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-8">
          <ReflectionContent content={reflection.content} />
        </div>

        {/* Deep review section */}
        <ReviewButton 
          reflectionId={reflection.id} 
          existingReview={reflection.review_content}
        />
      </div>
    </div>
  )
}

function ComicPlaceholder({ createdAt }: { createdAt: string }) {
  const createdDate = new Date(createdAt)
  const now = new Date()
  const ageMinutes = (now.getTime() - createdDate.getTime()) / 60000
  
  // If created within the last 5 minutes, show "generating" state
  // Otherwise, show nothing (comic generation may have failed)
  if (ageMinutes < 5) {
    return (
      <div className="mb-8 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-[var(--muted)]">
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Generating your comic...</span>
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">This usually takes about 30 seconds</p>
        </div>
      </div>
    )
  }
  
  // Older reflection without comic - don't show anything
  return null
}

function ReflectionContent({ content }: { content: string }) {
  // Simple markdown rendering with XSS protection
  // Use [^*] instead of . to prevent catastrophic backtracking on malformed input
  const html = content
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc mb-4">$&</ul>')
    .replace(/^(?!<[hul]|<li)(.+)$/gm, '<p class="mb-4">$1</p>')
    .replace(/<\/ul>\n<ul[^>]*>/g, '')

  // Sanitize HTML to prevent XSS attacks from commit messages
  const sanitizedHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h2', 'h3', 'strong', 'em', 'li', 'ul', 'p'],
    ALLOWED_ATTR: ['class'],
  })

  return <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
}
