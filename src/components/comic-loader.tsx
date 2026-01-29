'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ComicLoaderProps {
  reflectionId: string
  initialComicUrl: string | null
  createdAt: string
  altText: string
}

export function ComicLoader({ reflectionId, initialComicUrl, createdAt, altText }: ComicLoaderProps) {
  const [comicUrl, setComicUrl] = useState(initialComicUrl)
  const [isPolling, setIsPolling] = useState(!initialComicUrl)

  useEffect(() => {
    if (comicUrl || !isPolling) return

    const createdDate = new Date(createdAt)
    const ageMinutes = (Date.now() - createdDate.getTime()) / 60000

    // Don't poll for old reflections (>5 min)
    if (ageMinutes > 5) {
      setIsPolling(false)
      return
    }

    const supabase = createClient()
    let pollCount = 0
    const maxPolls = 30 // 30 * 5s = 2.5 minutes max polling

    const poll = async () => {
      pollCount++
      
      const { data } = await supabase
        .from('reflections')
        .select('comic_url')
        .eq('id', reflectionId)
        .single()

      if (data?.comic_url) {
        setComicUrl(data.comic_url)
        setIsPolling(false)
      } else if (pollCount >= maxPolls) {
        setIsPolling(false)
      }
    }

    // Poll every 5 seconds
    const interval = setInterval(poll, 5000)
    
    // Initial poll after 3 seconds
    const timeout = setTimeout(poll, 3000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [reflectionId, comicUrl, isPolling, createdAt])

  // Show the comic if we have it
  if (comicUrl) {
    return (
      <div className="mb-8">
        <img 
          src={comicUrl} 
          alt={altText}
          className="w-full rounded-lg"
        />
      </div>
    )
  }

  // Show loading state if still polling
  if (isPolling) {
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

  // Old reflection without comic - show nothing
  return null
}
