import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SubscriptionSection } from './subscription-section'
import { PreferencesSection } from './preferences-section'

export default async function SettingsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
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
      </header>

      <div className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        {/* Account section */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Account</h2>
          <div className="border border-[var(--border)] rounded-lg p-4 space-y-3">
            <div>
              <div className="text-sm text-[var(--muted)]">Email</div>
              <div>{profile?.email || user.email}</div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted)]">Name</div>
              <div>{profile?.name || 'Not set'}</div>
            </div>
          </div>
        </section>

        {/* Subscription section */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Subscription</h2>
          <SubscriptionSection 
            status={profile?.subscription_status || 'trial'}
            trialEndsAt={profile?.trial_ends_at}
            hasStripeCustomer={!!profile?.stripe_customer_id}
          />
        </section>

        {/* Preferences section */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Preferences</h2>
          <PreferencesSection 
            writeToRepo={profile?.write_to_repo !== false}
            timezone={profile?.timezone || 'America/New_York'}
          />
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-lg font-semibold mb-4 text-red-600">Danger Zone</h2>
          <div className="border border-red-200 dark:border-red-900 rounded-lg p-4">
            <p className="text-sm text-[var(--muted)] mb-4">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <button
              className="text-sm text-red-600 hover:text-red-700 font-medium"
              disabled
            >
              Delete account (coming soon)
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
