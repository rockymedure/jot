import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

export function getStripe() {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return stripeInstance
}

export const PLANS = {
  pro: {
    name: 'Pro',
    price: 1000, // $10.00 in cents
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
  }
}

/**
 * Create a Stripe checkout session for subscription
 */
export async function createCheckoutSession(
  customerId: string,
  userId: string,
  returnUrl: string
) {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: PLANS.pro.priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: 7,
    },
    success_url: `${returnUrl}?success=true`,
    cancel_url: `${returnUrl}?canceled=true`,
    metadata: {
      userId,
    },
  })

  return session
}

/**
 * Create a Stripe billing portal session
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string
) {
  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })

  return session
}

/**
 * Create or get a Stripe customer for a user
 */
export async function getOrCreateCustomer(
  email: string,
  userId: string,
  existingCustomerId?: string
) {
  if (existingCustomerId) {
    return existingCustomerId
  }

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    email,
    metadata: {
      userId,
    },
  })

  return customer.id
}
