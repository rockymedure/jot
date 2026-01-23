# jot

**Your AI co-founder, in your inbox.**

jot reads your GitHub commits each day and emails you a blunt, honest reflection about what you accomplished, what patterns it noticed, and questions to think about for tomorrow.

## Features

- **GitHub OAuth** — Connect your repos in one click
- **Daily reflections** — Analyzes your commits every evening
- **Blunt co-founder voice** — No fluff, just clarity
- **Email delivery** — Lands in your inbox at 8pm
- **Subscription billing** — 7-day trial, then $10/month

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Auth/Database**: Supabase
- **AI**: Claude (Anthropic)
- **Email**: Resend
- **Payments**: Stripe
- **Hosting**: Vercel

## Deploy

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Run the migration in `migrations/001_initial_schema.sql`
3. Enable GitHub OAuth in Authentication → Providers
4. Copy your project URL and keys

### 2. Set Up GitHub OAuth

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set callback URL to: `https://your-supabase-project.supabase.co/auth/v1/callback`
4. Copy client ID and secret to Supabase GitHub provider settings

### 3. Set Up Stripe

1. Create products in Stripe Dashboard:
   - Pro plan: $10/month recurring
2. Create a webhook endpoint pointing to `/api/webhooks/stripe`
3. Subscribe to events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

### 4. Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRO_PRICE_ID=
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
CRON_SECRET=your-random-secret
```

4. Vercel will automatically set up the cron job from `vercel.json`

### 5. Configure Email (Resend)

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain
3. Update the `from` address in `src/lib/email.ts`

## Development

```bash
npm install
npm run dev
```

## License

MIT
