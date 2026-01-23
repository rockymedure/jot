'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  writeToRepo: boolean
}

export function PreferencesSection({ writeToRepo: initialWriteToRepo }: Props) {
  const [writeToRepo, setWriteToRepo] = useState(initialWriteToRepo)
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  const toggleWriteToRepo = async () => {
    setSaving(true)
    const newValue = !writeToRepo
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({ write_to_repo: newValue })
      .eq('id', user.id)

    if (!error) {
      setWriteToRepo(newValue)
    }
    
    setSaving(false)
  }

  return (
    <div className="border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Write reflections to repo</div>
          <div className="text-sm text-[var(--muted)]">
            Save each reflection as a markdown file in a <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">jot/</code> folder in your tracked repos
          </div>
        </div>
        <button
          onClick={toggleWriteToRepo}
          disabled={saving}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            writeToRepo 
              ? 'bg-green-500' 
              : 'bg-neutral-300 dark:bg-neutral-600'
          } ${saving ? 'opacity-50' : ''}`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
              writeToRepo ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
