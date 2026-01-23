import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'

interface Props {
  params: Promise<{ token: string }>
}

export default async function SharedReflectionPage({ params }: Props) {
  const { token } = await params
  const supabase = createServiceClient()

  // Fetch reflection by share token (using service client to bypass RLS)
  const { data: reflection, error } = await supabase
    .from('reflections')
    .select(`
      id,
      date,
      content,
      commit_count,
      repos(
        name,
        full_name
      )
    `)
    .eq('share_token', token)
    .single()

  if (error || !reflection) {
    notFound()
  }

  const repo = reflection.repos as unknown as { name: string; full_name: string }
  const formattedDate = format(new Date(reflection.date), 'EEEE, MMMM d, yyyy')

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono text-xl font-bold">
            jot
          </Link>
          <span className="text-sm text-[var(--muted)]">
            Shared reflection
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Reflection header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{formattedDate}</h1>
          <div className="flex items-center gap-3 text-[var(--muted)]">
            <span>{repo.name}</span>
            <span>•</span>
            <span>{reflection.commit_count} commits</span>
          </div>
        </div>

        {/* Reflection content */}
        <div className="prose bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-8">
          <ReflectionContent content={reflection.content} />
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <p className="text-[var(--muted)] mb-4">
            jot sends founders daily reflections on their commits.
          </p>
          <Link 
            href="/"
            className="inline-flex items-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Try jot free for 7 days
          </Link>
        </div>
      </div>
    </div>
  )
}

function ReflectionContent({ content }: { content: string }) {
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
