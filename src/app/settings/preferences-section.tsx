'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Common US timezones for the dropdown
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
]

interface Props {
  writeToRepo: boolean
  timezone: string
}

export function PreferencesSection({ writeToRepo: initialWriteToRepo, timezone: initialTimezone }: Props) {
  const [writeToRepo, setWriteToRepo] = useState(initialWriteToRepo)
  const [timezone, setTimezone] = useState(initialTimezone || 'America/New_York')
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

  const updateTimezone = async (newTimezone: string) => {
    setSaving(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({ timezone: newTimezone })
      .eq('id', user.id)

    if (!error) {
      setTimezone(newTimezone)
    }
    
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Timezone</div>
            <div className="text-sm text-[var(--muted)]">
              Used for reflection dates and understanding when your commits happened
            </div>
          </div>
          <select
            value={timezone}
            onChange={(e) => updateTimezone(e.target.value)}
            disabled={saving}
            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm disabled:opacity-50"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      </div>

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
    </div>
  )
}
