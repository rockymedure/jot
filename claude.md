# jot

**Your AI co-founder, in your inbox.**

jot reads your GitHub commits each day and emails you a blunt, honest reflection about what you accomplished, what patterns it noticed, and questions to think about for tomorrow.

## Product Vision

Solo founders build alone. No co-founder to call you out when you're distracted, celebrate real progress, or ask the hard questions. jot is that co-founder.

## How It Works

1. User clicks "Connect GitHub" → goes directly to GitHub OAuth (no intermediate login page)
2. Selects which repos to track
3. **First reflection**: jot reads the README, repo description, and recent commits to introduce itself as your co-founder who understands your project
4. **Smart reflections**: jot detects when you stop coding:
   - GitHub webhooks track push events in real-time
   - After 2 hours of inactivity, jot generates your reflection
   - Fallback: 9 PM if no webhook
   - Emails you a blunt reflection
   - Optionally writes the reflection to a `jot/` folder in the repo
5. $10/mo after 7-day trial

## Key Features

- **All branches**: Fetches commits from every branch, not just main
- **Inactivity-based timing**: GitHub webhooks detect when you stop coding (2h idle = reflection time)
- **First reflection**: Special intro that analyzes the project and asks strategic questions
- **Streaming reflections**: Real-time display with Claude's extended thinking visible
- **Daily comic strips**: AI-generated comics that capture the emotional story of your day
- **Deep Review**: Agent SDK-powered code review that clones your repo and analyzes actual code
- **Write to repo**: Optionally saves reflections as markdown files in your repo
- **Shareable links**: Generate public links to share individual reflections
- **Email notifications**: Daily reflections with comic + deep review completion emails
- **Light/dark mode**: Theme toggle in header with system preference detection

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Auth**: Supabase Auth with GitHub OAuth
- **Database**: Supabase (Postgres)
- **Storage**: Supabase Storage (comics bucket)
- **Email**: Resend (domain: mail.jotgrowsideas.com)
- **AI**: Claude Sonnet 4 (Anthropic) with extended thinking
- **Image Generation**: fal.ai (Nano Banana Pro) for daily comic strips
- **Agent SDK**: @anthropic-ai/claude-agent-sdk for deep code reviews
- **Payments**: Stripe (live mode)
- **Hosting**: Railway
- **Domain**: jotgrowsideas.com

## Database Schema

```sql
-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  avatar_url text,
  github_access_token text, -- encrypted
  stripe_customer_id text,
  subscription_status text default 'trial', -- trial, active, cancelled
  trial_ends_at timestamptz default (now() + interval '7 days'),
  write_to_repo boolean default true, -- save reflections to repo's jot/ folder
  created_at timestamptz default now()
);

-- Repos being tracked
create table public.repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade,
  github_repo_id bigint not null,
  name text not null,
  full_name text not null,
  is_active boolean default true,
  last_push_at timestamptz,          -- Last push from GitHub webhook
  webhook_id bigint,                  -- GitHub webhook ID for cleanup
  webhook_secret text,                -- Secret for verifying webhook payloads
  created_at timestamptz default now(),
  unique(user_id, github_repo_id)
);

-- Generated reflections
create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid references public.repos on delete cascade,
  date date not null,
  content text not null,
  summary text,                    -- One-line summary for dashboard cards
  commit_count integer,
  commits_data jsonb,              -- stores commit SHAs, messages, dates
  share_token text unique,         -- Public share link token
  comic_url text,                  -- URL to AI-generated comic strip (Supabase Storage)
  review_content text,             -- Deep review from Agent SDK
  review_requested_at timestamptz, -- When deep review was generated
  created_at timestamptz default now(),
  unique(repo_id, date)
);
```

## Core Pages

- `/` — Landing page (buttons go directly to GitHub OAuth)
- `/login` — Fallback login page (rarely used)
- `/dashboard` — Repo management, past reflections
- `/reflections/[id]` — View a single reflection (with share button)
- `/share/[token]` — Public view of a shared reflection (no auth required)
- `/settings` — Email preferences, subscription, write-to-repo toggle

## API Routes

- `/api/auth/github` — Initiates GitHub OAuth flow directly
- `/api/auth/callback` — GitHub OAuth callback
- `/api/reflections/generate` — Generate reflection for a repo (used on first add)
- `/api/reflections/stream` — Stream reflection with extended thinking visible
- `/api/reflections/share` — Generate/remove share tokens for reflections
- `/api/review` — Deep code review using Agent SDK (clones repo, analyzes code)
- `/api/cron/generate-reflections` — Hourly cron, triggers on inactivity or 9 PM fallback
- `/api/webhooks/github` — Receives GitHub push events, updates last_push_at
- `/api/repos/webhook` — Create/delete GitHub webhooks for a repo
- `/api/webhooks/stripe` — Stripe webhook handler
- `/api/stripe/checkout` — Create Stripe checkout session
- `/api/stripe/portal` — Redirect to Stripe billing portal

## Key Files

- `src/lib/supabase/` — Supabase client setup (client, server, service)
- `src/lib/github.ts` — GitHub API helpers (commits, branches, README, write file, rate limiting)
- `src/lib/claude.ts` — Claude API for reflection generation (streaming, extended thinking)
- `src/lib/fal.ts` — fal.ai comic generation + Supabase Storage upload
- `src/lib/email.ts` — Resend email sending (reflections with comics + review notifications)
- `src/lib/theme.tsx` — Theme context and provider
- `src/components/theme-toggle.tsx` — Light/dark mode toggle
- `src/components/review-button.tsx` — Deep review trigger + results display
- `src/components/share-button.tsx` — Generate shareable links
- `src/app/api/cron/` — Cron job for daily reflections
- `src/app/api/review/` — Agent SDK deep code review
- `src/app/api/comics/backfill/` — Backfill comics for existing reflections

## Voice/Tone

jot speaks like a blunt, direct co-founder:
- No fluff or cheerleading
- Calls out distractions and scope creep
- Asks pointed questions
- Respects the founder's time

## Current Status

MVP Complete - Live at jotgrowsideas.com

### Core Features
- [x] GitHub OAuth (direct flow, no intermediate page)
- [x] Repo selection and tracking
- [x] First reflection with project analysis
- [x] Daily reflections via cron
- [x] Streaming reflections with extended thinking
- [x] Daily comic strips (fal.ai → Supabase Storage)
- [x] Deep code review via Agent SDK
- [x] Email delivery (reflections with comics + review notifications)
- [x] Write reflections to repo (jot/ folder)
- [x] Shareable reflection links
- [x] Stripe billing (checkout, portal, webhooks)
- [x] Light/dark mode with theme toggle

### Technical
- [x] Fetch commits from ALL branches
- [x] Smart timing (since last reflection, not 24h window)
- [x] GitHub API rate limiting with exponential backoff
- [x] XSS protection with DOMPurify
- [x] Theme persistence with localStorage
- [x] Flash prevention for theme

## Technical Architecture

### Auth Flow
```
Landing Page → /api/auth/github → GitHub OAuth → /auth/callback → Dashboard
```
- No intermediate login page - buttons go directly to GitHub
- OAuth callback stores `provider_token` (GitHub access token) in profiles table
- GitHub token used for all repo operations (read commits, write reflections)

### Reflection Generation Flow
```
1. Trigger (cron or manual)
2. Fetch all branches from repo
3. For each branch, fetch commits since last reflection
4. Deduplicate by SHA
5. Fetch detailed commit info (files, stats)
6. Stream to Claude with extended thinking
7. Generate comic with fal.ai → upload to Supabase Storage
8. Store reflection in DB (with summary + comic_url)
9. Send email via Resend (comic displayed at top)
10. Write to repo (if enabled)
```

### Deep Review Flow
```
1. User clicks "Review this work" on a reflection
2. Clone repo to temp directory (shallow clone)
3. Agent SDK queries Claude with read-only tools (Glob, Grep, Read)
4. Claude explores codebase and analyzes commits
5. Store review in reflections.review_content
6. Send email with summary + issue list
7. Cleanup temp directory
```

### Supabase Clients
- **client.ts** (`createClient`) - Browser-side, uses anon key, respects RLS
- **server.ts** (`createClient`) - Server components, uses cookies for auth
- **service.ts** (`createServiceClient`) - Service role, bypasses RLS (for cron jobs)

### Theme System
- CSS variables in `globals.css` (`:root` for light, `[data-theme="dark"]` for dark)
- Blocking script in `<head>` prevents flash
- Context in `src/lib/theme.tsx` manages state
- Persisted to `localStorage` as `jot-theme`

### Reflection Triggering
Two modes for determining when to generate reflections:

**Webhook mode (preferred)**:
1. GitHub webhook fires on every push → updates `last_push_at`
2. Hourly cron checks: if 2+ hours since last push → generate reflection
3. Resets `last_push_at` after generation to prevent duplicates

**Fallback mode (no webhook)**:
1. Hourly cron checks user's timezone
2. At 9 PM local time → generate reflection

### Cron Job
- Configured in `vercel.json` to run every hour (`0 * * * *`)
- Endpoint: `/api/cron/generate-reflections`
- Protected by `CRON_SECRET` bearer token
- Processes repos based on inactivity (webhook) or time (fallback)

## Environment Variables

### Supabase
Found at: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
- `NEXT_PUBLIC_SUPABASE_URL` - Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - service_role key (secret, bypasses RLS)

### Anthropic (Claude)
Found at: https://console.anthropic.com/settings/keys
- `ANTHROPIC_API_KEY` - API key for Claude

### fal.ai (Image Generation)
Found at: https://fal.ai/dashboard/keys
- `FAL_KEY` - API key for comic generation

### Resend (Email)
Found at: https://resend.com/api-keys
- `RESEND_API_KEY` - API key
- Domain verified: mail.jotgrowsideas.com

### Stripe
Found at: https://dashboard.stripe.com/apikeys
- `STRIPE_SECRET_KEY` - Secret key (sk_live_...)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Publishable key (pk_live_...)
- `STRIPE_WEBHOOK_SECRET` - From webhook endpoint settings (whsec_...)
- `STRIPE_PRO_PRICE_ID` - Price ID for $10/mo plan (price_...)

### App Config
- `NEXT_PUBLIC_APP_URL` - https://jotgrowsideas.com (used for OAuth redirects)
- `CRON_SECRET` - Random string to protect cron endpoint

### GitHub OAuth (configured in Supabase)
Supabase Dashboard → Authentication → Providers → GitHub
- Client ID and Secret from: https://github.com/settings/developers
- Callback URL: https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback

## Deployments

### Railway (Production)
- Dashboard: https://railway.app/dashboard
- Project: jot
- Auto-deploys from `main` branch
- Environment variables set in Railway dashboard

### Local Development
```bash
# Copy env template
cp .env.example .env.local

# Add your keys to .env.local

# Start dev server
npm run dev
```

### Cron Setup
Railway doesn't have native cron. Options:
1. **cron-job.org** - Free, call `/api/cron/generate-reflections` with bearer token
2. **Railway cron service** - Add separate service with cron schedule
3. **Vercel** (if migrating) - Native cron in vercel.json

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Repository

https://github.com/rockymedure/jot

## Useful Links

- **Production**: https://jotgrowsideas.com
- **Supabase**: https://supabase.com/dashboard
- **Stripe**: https://dashboard.stripe.com
- **Resend**: https://resend.com
- **Railway**: https://railway.app
- **Anthropic**: https://console.anthropic.com
