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
  timezone: string
}

export function PreferencesSection({ timezone: initialTimezone }: Props) {
  const [timezone, setTimezone] = useState(initialTimezone || 'America/New_York')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

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
    </div>
  )
}
