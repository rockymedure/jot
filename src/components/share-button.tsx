'use client'

import { useState } from 'react'
import { Share2, Check, Link2, X } from 'lucide-react'

interface ShareButtonProps {
  reflectionId: string
  initialShareToken?: string | null
}

export function ShareButton({ reflectionId, initialShareToken }: ShareButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(
    initialShareToken ? `${window.location.origin}/share/${initialShareToken}` : null
  )
  const [copied, setCopied] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const generateShareLink = async () => {
    if (shareUrl) {
      // Already has a link, just copy it
      await copyToClipboard(shareUrl)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/reflections/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflectionId })
      })

      if (response.ok) {
        const { shareUrl: url } = await response.json()
        setShareUrl(url)
        await copyToClipboard(url)
      }
    } catch (error) {
      console.error('Failed to generate share link:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const removeShareLink = async () => {
    setIsLoading(true)
    try {
      await fetch(`/api/reflections/share?reflectionId=${reflectionId}`, {
        method: 'DELETE'
      })
      setShareUrl(null)
      setShowMenu(false)
    } catch (error) {
      console.error('Failed to remove share link:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <button
        onClick={() => shareUrl ? setShowMenu(!showMenu) : generateShareLink()}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--surface)] transition-colors disabled:opacity-50"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-green-500" />
            Copied!
          </>
        ) : (
          <>
            <Share2 className="w-4 h-4" />
            {shareUrl ? 'Shared' : 'Share'}
          </>
        )}
      </button>

      {/* Dropdown menu when link exists */}
      {showMenu && shareUrl && (
        <div className="absolute right-0 mt-2 w-64 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg z-10">
          <div className="p-3 border-b border-[var(--border)]">
            <p className="text-xs text-[var(--muted)] mb-2">Share link</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 truncate"
              />
              <button
                onClick={() => copyToClipboard(shareUrl)}
                className="p-1 hover:bg-[var(--surface)] rounded"
              >
                <Link2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <button
            onClick={removeShareLink}
            disabled={isLoading}
            className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-[var(--surface)] flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Remove share link
          </button>
        </div>
      )}

      {/* Click outside to close */}
      {showMenu && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  )
}
