import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { ShareButton } from '@/components/share-button'
import { ReviewButton } from '@/components/review-button'

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

  const formattedDate = format(new Date(reflection.date), 'EEEE, MMMM d, yyyy')

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

function ReflectionContent({ content }: { content: string }) {
  // Simple markdown rendering
  const html = content
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc mb-4">$&</ul>')
    .replace(/^(?!<[hul]|<li)(.+)$/gm, '<p class="mb-4">$1</p>')
    .replace(/<\/ul>\n<ul[^>]*>/g, '')

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
