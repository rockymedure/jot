# jot

**Your AI co-founder, in your inbox.**

jot reads your GitHub commits each day and emails you a blunt, honest reflection about what you accomplished, what patterns it noticed, and questions to think about for tomorrow.

## Product Vision

Solo founders build alone. No co-founder to call you out when you're distracted, celebrate real progress, or ask the hard questions. jot is that co-founder.

## How It Works

1. User clicks "Connect GitHub" → goes directly to GitHub OAuth (no intermediate login page)
2. Selects which repos to track
3. **First reflection**: jot reads the README, repo description, and recent commits to introduce itself as your co-founder who understands your project
4. **Daily reflections**: Every evening, jot:
   - Fetches commits from ALL branches since the last reflection
   - Sends them to Claude for analysis
   - Emails the user a blunt reflection
   - Optionally writes the reflection to a `jot/` folder in the repo
5. $10/mo after 7-day trial

## Key Features

- **All branches**: Fetches commits from every branch, not just main
- **Smart timing**: Uses last reflection timestamp as cutoff (no arbitrary 24h window)
- **First reflection**: Special intro that analyzes the project and asks strategic questions
- **Write to repo**: Optionally saves reflections as markdown files in your repo
- **Light/dark mode**: Theme toggle in header with system preference detection

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Auth**: Supabase Auth with GitHub OAuth
- **Database**: Supabase (Postgres)
- **Email**: Resend (domain: mail.jotgrowsideas.com)
- **AI**: Claude Sonnet 4 (Anthropic)
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
  created_at timestamptz default now(),
  unique(user_id, github_repo_id)
);

-- Generated reflections
create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid references public.repos on delete cascade,
  date date not null,
  content text not null,
  commit_count integer,
  commits_data jsonb, -- stores commit SHAs, messages, dates
  created_at timestamptz default now(),
  unique(repo_id, date)
);
```

## Core Pages

- `/` — Landing page (buttons go directly to GitHub OAuth)
- `/login` — Fallback login page (rarely used)
- `/dashboard` — Repo management, past reflections
- `/reflections/[id]` — View a single reflection
- `/settings` — Email preferences, subscription, write-to-repo toggle

## API Routes

- `/api/auth/github` — Initiates GitHub OAuth flow directly
- `/api/auth/callback` — GitHub OAuth callback
- `/api/reflections/generate` — Generate reflection for a repo (used on first add)
- `/api/cron/generate-reflections` — Daily cron job for all active repos
- `/api/webhooks/stripe` — Stripe webhook handler
- `/api/stripe/checkout` — Create Stripe checkout session
- `/api/stripe/portal` — Redirect to Stripe billing portal

## Key Files

- `src/lib/supabase/` — Supabase client setup (client, server, service)
- `src/lib/github.ts` — GitHub API helpers (commits, branches, README, write file)
- `src/lib/claude.ts` — Claude API for reflection generation (daily + first reflection)
- `src/lib/email.ts` — Resend email sending
- `src/lib/theme.tsx` — Theme context and provider
- `src/components/theme-toggle.tsx` — Light/dark mode toggle
- `src/app/api/cron/` — Cron job for daily reflections

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
- [x] Email delivery (Resend)
- [x] Write reflections to repo (jot/ folder)
- [x] Stripe billing (checkout, portal, webhooks)
- [x] Light/dark mode with theme toggle

### Technical
- [x] Fetch commits from ALL branches
- [x] Smart timing (since last reflection, not 24h window)
- [x] Theme persistence with localStorage
- [x] Flash prevention for theme

## Environment Variables

Required in Railway:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRO_PRICE_ID`
- `NEXT_PUBLIC_APP_URL` (https://jotgrowsideas.com)
- `CRON_SECRET`

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Build for production
```

## Repository

https://github.com/rockymedure/jot
