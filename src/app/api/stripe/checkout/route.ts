import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession, getOrCreateCustomer } from '@/lib/stripe'

export async function POST() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  try {
    // Get or create Stripe customer
    const customerId = await getOrCreateCustomer(
      profile.email || user.email!,
      user.id,
      profile.stripe_customer_id
    )

    // Update profile with customer ID if new
    if (!profile.stripe_customer_id) {
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // Create checkout session
    const session = await createCheckoutSession(
      customerId,
      user.id,
      `${process.env.NEXT_PUBLIC_APP_URL}/settings`
    )

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
  }
}
