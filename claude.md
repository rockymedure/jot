# jot

**Your AI co-founder, in your inbox.**

jot reads your GitHub commits each day and emails you a blunt, honest reflection about what you accomplished, what patterns it noticed, and questions to think about for tomorrow.

## Product Vision

Solo founders build alone. No co-founder to call you out when you're distracted, celebrate real progress, or ask the hard questions. jot is that co-founder.

## How It Works

1. User signs up with GitHub OAuth
2. Selects which repos to track
3. Every evening at 8pm, jot:
   - Fetches the day's commits via GitHub API
   - Sends them to Claude for analysis
   - Emails the user a blunt reflection
4. $10/mo after 7-day trial

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Auth**: Supabase Auth with GitHub OAuth
- **Database**: Supabase (Postgres)
- **Email**: Resend
- **AI**: Claude API (Anthropic)
- **Payments**: Stripe
- **Hosting**: Vercel or Railway

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
  created_at timestamptz default now(),
  unique(repo_id, date)
);
```

## Core Pages

- `/` — Landing page
- `/dashboard` — Repo management, past reflections
- `/reflections/[id]` — View a single reflection
- `/settings` — Email preferences, subscription

## API Routes

- `/api/auth/callback` — GitHub OAuth callback
- `/api/cron/generate-reflections` — Daily cron job
- `/api/webhooks/stripe` — Stripe webhook handler

## Key Files

- `src/lib/supabase/` — Supabase client setup
- `src/lib/github.ts` — GitHub API helpers
- `src/lib/claude.ts` — Claude API for reflection generation
- `src/lib/email.ts` — Resend email sending
- `src/app/api/cron/` — Cron job for daily reflections

## Voice/Tone

jot speaks like a blunt, direct co-founder:
- No fluff or cheerleading
- Calls out distractions and scope creep
- Asks pointed questions
- Respects the founder's time

## Current Status

MVP Complete:
1. [x] Project setup (Next.js, Supabase, Tailwind)
2. [x] Landing page
3. [x] GitHub OAuth
4. [x] Repo selection UI
5. [x] Database schema (migrations/001_initial_schema.sql)
6. [x] Daily cron engine (/api/cron/generate-reflections)
7. [x] Email delivery (Resend)
8. [x] Stripe billing (checkout, portal, webhooks)
9. [ ] Deploy to Vercel

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run jot      # (future) Manual trigger for reflection
```
