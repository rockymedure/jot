'use client'

import { useState } from 'react'
import { Search, Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight, AlertTriangle, Shield, Bug, Code, TestTube, Layers, Zap, Copy, Check } from 'lucide-react'

interface ReviewButtonProps {
  reflectionId: string
  existingReview?: string | null
}

interface ParsedIssue {
  number: number
  title: string
  priority?: string
  file?: string
  content: string
}

interface ParsedSection {
  title: string
  icon: React.ReactNode
  issues: ParsedIssue[]
}

function parseReviewContent(content: string): { sections: ParsedSection[], summary: string, positives: string[] } {
  const sections: ParsedSection[] = []
  const positives: string[] = []
  let summary = ''

  // Extract summary section - try multiple patterns
  const summaryPatterns = [
    /##\s*Summary\s*\n([\s\S]*?)(?=\n##|$)/i,
    /##\s*Overview\s*\n([\s\S]*?)(?=\n##|$)/i,
  ]
  for (const pattern of summaryPatterns) {
    const match = content.match(pattern)
    if (match) {
      summary = match[1].trim()
      break
    }
  }

  // Extract positive notes - try multiple patterns
  const positivePatterns = [
    /##\s*What's Working Well\s*\n([\s\S]*?)(?=\n##|$)/i,
    /##\s*Positive Notes\s*\n([\s\S]*?)(?=\n##|$)/i,
    /##\s*What.*Well\s*\n([\s\S]*?)(?=\n##|$)/i,
  ]
  for (const pattern of positivePatterns) {
    const match = content.match(pattern)
    if (match) {
      const lines = match[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('✅'))
      positives.push(...lines.map(l => l.replace(/^[-✅]\s*/, '').trim()).filter(Boolean))
      break
    }
  }

  // Known section patterns and their icons
  const knownSections: Record<string, { icon: React.ReactNode }> = {
    'critical': { icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
    'security': { icon: <Shield className="w-4 h-4 text-orange-500" /> },
    'error': { icon: <Bug className="w-4 h-4 text-yellow-500" /> },
    'quality': { icon: <Code className="w-4 h-4 text-blue-500" /> },
    'test': { icon: <TestTube className="w-4 h-4 text-purple-500" /> },
    'architecture': { icon: <Layers className="w-4 h-4 text-indigo-500" /> },
    'edge': { icon: <Zap className="w-4 h-4 text-cyan-500" /> },
    'issue': { icon: <Bug className="w-4 h-4 text-yellow-500" /> },
    'bug': { icon: <Bug className="w-4 h-4 text-red-500" /> },
  }

  // First, try to find issues in specific sections
  const sectionPattern = /##\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/g
  let sectionMatch
  const seenIssueNumbers = new Set<number>()
  
  while ((sectionMatch = sectionPattern.exec(content)) !== null) {
    const sectionTitle = sectionMatch[1].trim()
    const sectionContent = sectionMatch[2]
    
    // Skip summary and positive sections
    if (/summary|overview|positive|what.*well|recommendation/i.test(sectionTitle)) {
      continue
    }
    
    const issues = parseIssues(sectionContent)
    // Filter out duplicate issue numbers
    const uniqueIssues = issues.filter(issue => {
      if (seenIssueNumbers.has(issue.number)) return false
      seenIssueNumbers.add(issue.number)
      return true
    })
    
    if (uniqueIssues.length > 0) {
      // Find matching icon based on section title keywords
      let icon: React.ReactNode = <Code className="w-4 h-4 text-blue-500" />
      const titleLower = sectionTitle.toLowerCase()
      for (const [keyword, config] of Object.entries(knownSections)) {
        if (titleLower.includes(keyword)) {
          icon = config.icon
          break
        }
      }
      
      sections.push({ title: sectionTitle, icon, issues: uniqueIssues })
    }
  }

  // Fallback: if no sections found, try to parse issues from the entire content
  if (sections.length === 0) {
    const allIssues = parseIssues(content)
    if (allIssues.length > 0) {
      sections.push({
        title: 'Issues Found',
        icon: <Bug className="w-4 h-4 text-yellow-500" />,
        issues: allIssues
      })
    }
  }

  return { sections, summary, positives }
}

function parseIssues(content: string): ParsedIssue[] {
  const issues: ParsedIssue[] = []
  
  // Try multiple patterns for issue headers
  const patterns = [
    // ### 1. Title or ### 1: Title
    /###\s*(\d+)[.:]\s*([^\n]+)\n([\s\S]*?)(?=\n###\s*\d+[.:]|$)/g,
    // **1. Title** or **1: Title**
    /\*\*(\d+)[.:]\s*([^*\n]+)\*\*\n([\s\S]*?)(?=\n\*\*\d+[.:]|$)/g,
    // 1. **Title** (numbered list with bold)
    /^(\d+)\.\s*\*\*([^*\n]+)\*\*\n([\s\S]*?)(?=\n\d+\.\s*\*\*|$)/gm,
  ]
  
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const number = parseInt(match[1])
      // Skip if we already have this issue number
      if (issues.some(i => i.number === number)) continue
      
      let titleLine = match[2].trim()
      const issueContent = match[3].trim()
      
      // Extract priority if present (in parentheses)
      const priorityMatch = titleLine.match(/\(([^)]+)\)/)
      const priority = priorityMatch ? priorityMatch[1] : undefined
      
      // Clean up the title - remove parenthetical priority, bold markers, and extra asterisks
      let title = titleLine
        .replace(/\([^)]+\)/, '')  // Remove (HIGH PRIORITY) etc
        .replace(/\*\*/g, '')       // Remove all ** markers
        .replace(/\s+/g, ' ')       // Normalize whitespace
        .trim()
    
      // Extract file reference and clean it - strip ** first, then extract
      const cleanedForFile = issueContent.replace(/\*\*/g, '')
      const fileMatch = cleanedForFile.match(/File:\s*`?([^\n`]+)`?/)
      let file = fileMatch ? fileMatch[1].trim() : undefined
      if (file) {
        file = file.replace(/^\*+|\*+$/g, '').trim() // Remove any remaining stray markers
        if (!file || /^[\s*]+$/.test(file)) file = undefined // Clear if empty or just asterisks
      }
    
      issues.push({
        number,
        title,
        priority,
        file,
        content: issueContent
      })
    }
  }
  
  return issues
}

function IssueAccordion({ issue }: { issue: ParsedIssue }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-[var(--border)]/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 mt-1 flex-shrink-0 text-[var(--muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-[var(--muted)]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-[var(--muted)]">#{issue.number}</span>
            <span className="font-medium">{issue.title}</span>
            {issue.priority && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">
                {issue.priority}
              </span>
            )}
          </div>
          {issue.file && !/^[\s*]+$/.test(issue.file) && (
            <div className="text-sm text-[var(--muted)] font-mono mt-1 truncate">
              {issue.file}
            </div>
          )}
        </div>
      </button>
      
      {isOpen && (
        <div className="px-4 pb-4 pl-11">
          <IssueContent content={issue.content} />
        </div>
      )}
    </div>
  )
}

function SummaryContent({ content }: { content: string }) {
  // Render summary with proper markdown
  const html = content
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[var(--foreground)]">$1</strong>')
    .replace(/^(\d+)\.\s+/gm, '<br/><span class="font-mono text-[var(--muted)]">$1.</span> ')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc my-2 text-[var(--muted)]">$&</ul>')
    .replace(/\n\n/g, '<br/><br/>')
  
  return <div className="text-sm text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: html }} />
}

function IssueContent({ content }: { content: string }) {
  // Remove file line since we show it in the header
  const cleanedContent = content.replace(/^File:\s*[^\n]+\n*/m, '')
  
  // Simple markdown rendering
  const html = cleanedContent
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-[var(--border)] p-3 rounded-lg overflow-x-auto my-3 text-sm"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-[var(--border)] px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^Problem:\s*/gm, '<p class="text-red-400 font-medium mt-3">Problem:</p><p class="text-[var(--muted)]">')
    .replace(/^Fix:\s*/gm, '</p><p class="text-green-400 font-medium mt-3">Fix:</p><p class="text-[var(--muted)]">')
    .replace(/^Impact:\s*/gm, '</p><p class="text-orange-400 font-medium mt-3">Impact:</p>')
    .replace(/^Best Practice:\s*/gm, '</p><p class="text-blue-400 font-medium mt-3">Best Practice:</p><p class="text-[var(--muted)]">')
    .replace(/^Recommendation:\s*/gm, '</p><p class="text-blue-400 font-medium mt-3">Recommendation:</p><p class="text-[var(--muted)]">')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-[var(--muted)]">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc my-2">$&</ul>')
    .replace(/\n\n/g, '</p><p class="mt-2 text-[var(--foreground)]">')
  
  return <div className="text-sm prose-sm" dangerouslySetInnerHTML={{ __html: html }} />
}

function SectionAccordion({ section }: { section: ParsedSection }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 text-left bg-[var(--surface)] hover:bg-[var(--border)]/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-[var(--muted)]" />
        ) : (
          <ChevronRight className="w-5 h-5 text-[var(--muted)]" />
        )}
        {section.icon}
        <span className="font-semibold flex-1">{section.title}</span>
        <span className="text-sm text-[var(--muted)] bg-[var(--border)] px-2 py-0.5 rounded-full">
          {section.issues.length} {section.issues.length === 1 ? 'issue' : 'issues'}
        </span>
      </button>
      
      {isOpen && (
        <div className="bg-[var(--background)]">
          {section.issues.map((issue) => (
            <IssueAccordion key={issue.number} issue={issue} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ReviewButton({ reflectionId, existingReview }: ReviewButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [review, setReview] = useState<string | null>(existingReview || null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCopyMarkdown = async () => {
    if (!review) return
    
    try {
      await navigator.clipboard.writeText(review)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

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
    const { sections, summary, positives } = parseReviewContent(review)
    const totalIssues = sections.reduce((sum, s) => sum + s.issues.length, 0)
    
    return (
      <div className="mt-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <h2 className="text-xl font-semibold">Deep Review</h2>
            </div>
            <p className="text-sm text-[var(--muted)] mt-1 ml-7">
              {totalIssues} {totalIssues === 1 ? 'issue' : 'issues'} found
            </p>
          </div>
          <button
            onClick={handleCopyMarkdown}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--border)]/50"
            title="Copy as Markdown"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>
        </div>
        
        {/* Summary */}
        {summary && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-2">Summary</h3>
            <SummaryContent content={summary} />
          </div>
        )}
        
        {/* Issue sections */}
        <div className="mb-6">
          {sections.map((section) => (
            <SectionAccordion key={section.title} section={section} />
          ))}
        </div>
        
        {/* Positive notes */}
        {positives.length > 0 && (
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
            <h3 className="font-semibold text-green-500 mb-2">What's Working Well</h3>
            <ul className="text-sm space-y-1">
              {positives.map((note, i) => {
                // Parse bold text in positives
                const formattedNote = note.replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--foreground)]">$1</strong>')
                return (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: formattedNote }} />
                  </li>
                )
              })}
            </ul>
          </div>
        )}
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
            This may take a minute. Jot is cloning the repo and analyzing your code.
            <br />
            <span className="text-[var(--muted)]/70">We&apos;ll email you when it&apos;s ready.</span>
          </p>
        )}
      </div>
    </div>
  )
}
