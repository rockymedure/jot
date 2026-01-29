'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ComicLoaderProps {
  reflectionId: string
  initialComicUrl: string | null
  createdAt: string
  altText: string
}

// Fun messages that rotate while generating
const LOADING_MESSAGES = [
  "Warming up the creative neurons...",
  "Consulting the comic muse...",
  "Drawing stick figures (just kidding)...",
  "Adding dramatic lighting...",
  "Perfecting the punchline...",
  "Teaching AI about humor...",
  "Sketching your coding adventures...",
  "Capturing today's vibe...",
  "Making art from your commits...",
  "Translating code to comedy...",
  "Finding the perfect panel layout...",
  "Adding existential developer angst...",
  "Brewing visual storytelling...",
  "Converting caffeine to pixels...",
]

export function ComicLoader({ reflectionId, initialComicUrl, createdAt, altText }: ComicLoaderProps) {
  const [comicUrl, setComicUrl] = useState(initialComicUrl)
  const [isPolling, setIsPolling] = useState(!initialComicUrl)
  const [messageIndex, setMessageIndex] = useState(0)

  // Rotate through fun messages
  useEffect(() => {
    if (!isPolling) return
    
    const interval = setInterval(() => {
      setMessageIndex(i => (i + 1) % LOADING_MESSAGES.length)
    }, 2500)
    
    return () => clearInterval(interval)
  }, [isPolling])

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
      <div className="mb-8 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 overflow-hidden">
        <div className="flex flex-col items-center justify-center">
          {/* Animated pencil/brush drawing */}
          <div className="relative w-32 h-32 mb-6">
            {/* Canvas/paper background */}
            <div className="absolute inset-0 bg-[var(--background)] rounded-lg border-2 border-dashed border-[var(--border)]" />
            
            {/* Animated "drawing" effect */}
            <div className="absolute inset-2 overflow-hidden">
              <div className="animate-pulse">
                {/* Comic panel borders being drawn */}
                <div 
                  className="absolute top-2 left-2 right-2 h-0.5 bg-[var(--foreground)] origin-left"
                  style={{ animation: 'drawLine 1.5s ease-out infinite' }}
                />
                <div 
                  className="absolute top-2 bottom-2 left-2 w-0.5 bg-[var(--foreground)] origin-top"
                  style={{ animation: 'drawLine 1.5s ease-out infinite 0.3s' }}
                />
                <div 
                  className="absolute bottom-2 left-2 right-2 h-0.5 bg-[var(--foreground)] origin-left"
                  style={{ animation: 'drawLine 1.5s ease-out infinite 0.6s' }}
                />
                <div 
                  className="absolute top-2 bottom-2 right-2 w-0.5 bg-[var(--foreground)] origin-top"
                  style={{ animation: 'drawLine 1.5s ease-out infinite 0.9s' }}
                />
              </div>
            </div>
            
            {/* Bouncing pencil */}
            <div 
              className="absolute -right-4 -top-4 text-4xl"
              style={{ animation: 'bounce 1s ease-in-out infinite, wiggle 0.3s ease-in-out infinite' }}
            >
              ✏️
            </div>
            
            {/* Sparkles */}
            <div className="absolute -left-2 top-1/2 text-xl animate-ping">✨</div>
            <div className="absolute right-1/4 -bottom-2 text-lg animate-ping" style={{ animationDelay: '0.5s' }}>✨</div>
          </div>
          
          {/* Rotating fun message */}
          <div className="text-center">
            <p 
              key={messageIndex}
              className="text-[var(--foreground)] font-medium animate-fadeIn"
            >
              {LOADING_MESSAGES[messageIndex]}
            </p>
            
            {/* Bouncing dots */}
            <div className="flex justify-center gap-1 mt-3">
              <span 
                className="w-2 h-2 bg-[var(--accent)] rounded-full"
                style={{ animation: 'bounce 0.6s ease-in-out infinite' }}
              />
              <span 
                className="w-2 h-2 bg-[var(--accent)] rounded-full"
                style={{ animation: 'bounce 0.6s ease-in-out infinite 0.1s' }}
              />
              <span 
                className="w-2 h-2 bg-[var(--accent)] rounded-full"
                style={{ animation: 'bounce 0.6s ease-in-out infinite 0.2s' }}
              />
            </div>
          </div>
        </div>
        
        {/* CSS animations */}
        <style jsx>{`
          @keyframes drawLine {
            0% { transform: scaleX(0); opacity: 0; }
            50% { transform: scaleX(1); opacity: 1; }
            100% { transform: scaleX(1); opacity: 0.3; }
          }
          @keyframes wiggle {
            0%, 100% { transform: rotate(-5deg); }
            50% { transform: rotate(5deg); }
          }
          @keyframes fadeIn {
            0% { opacity: 0; transform: translateY(-10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
        `}</style>
      </div>
    )
  }

  // Old reflection without comic - show nothing
  return null
}
