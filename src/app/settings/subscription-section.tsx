'use client'

import { useState } from 'react'
import { format } from 'date-fns'

interface Props {
  status: string
  trialEndsAt: string | null
  hasStripeCustomer: boolean
}

export function SubscriptionSection({ status, trialEndsAt, hasStripeCustomer }: Props) {
  const [loading, setLoading] = useState(false)

  const handleCheckout = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
      })
      const data = await response.json()
      
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Checkout error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePortal = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
      })
      const data = await response.json()
      
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Portal error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'active') {
    return (
      <div className="border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-green-800 dark:text-green-200">Pro Plan</div>
            <div className="text-sm text-green-700 dark:text-green-300">$10/month</div>
          </div>
          <button
            onClick={handlePortal}
            disabled={loading}
            className="text-sm text-green-700 dark:text-green-300 hover:underline disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Manage subscription'}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'trial') {
    const trialEnd = trialEndsAt ? new Date(trialEndsAt) : null
    const daysLeft = trialEnd 
      ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0

    return (
      <div className="border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 rounded-lg p-4">
        <div className="mb-4">
          <div className="font-medium text-amber-800 dark:text-amber-200">Free Trial</div>
          <div className="text-sm text-amber-700 dark:text-amber-300">
            {daysLeft > 0 ? (
              <>{daysLeft} days remaining (ends {trialEnd && format(trialEnd, 'MMM d')})</>
            ) : (
              <>Trial expired</>
            )}
          </div>
        </div>
        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Upgrade to Pro — $10/month'}
        </button>
      </div>
    )
  }

  if (status === 'cancelled' || status === 'past_due') {
    return (
      <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 rounded-lg p-4">
        <div className="mb-4">
          <div className="font-medium text-red-800 dark:text-red-200">
            {status === 'cancelled' ? 'Subscription Cancelled' : 'Payment Past Due'}
          </div>
          <div className="text-sm text-red-700 dark:text-red-300">
            {status === 'cancelled' 
              ? 'Your subscription has been cancelled. Resubscribe to continue receiving reflections.'
              : 'There was a problem with your payment. Please update your payment method.'}
          </div>
        </div>
        <button
          onClick={hasStripeCustomer ? handlePortal : handleCheckout}
          disabled={loading}
          className="w-full bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : hasStripeCustomer ? 'Update payment' : 'Resubscribe — $10/month'}
        </button>
      </div>
    )
  }

  return null
}
