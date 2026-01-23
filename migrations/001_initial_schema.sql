-- jot database schema
-- Run this in your Supabase SQL editor

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  avatar_url text,
  github_access_token text,
  stripe_customer_id text,
  subscription_status text default 'trial' check (subscription_status in ('trial', 'active', 'cancelled', 'past_due')),
  trial_ends_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Repos being tracked
create table if not exists public.repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade not null,
  github_repo_id bigint not null,
  name text not null,
  full_name text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, github_repo_id)
);

-- Generated reflections
create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid references public.repos on delete cascade not null,
  date date not null,
  content text not null,
  commit_count integer default 0,
  commits_data jsonb, -- Store raw commit data for reference
  created_at timestamptz default now(),
  unique(repo_id, date)
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.repos enable row level security;
alter table public.reflections enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Repos policies
create policy "Users can view own repos"
  on public.repos for select
  using (auth.uid() = user_id);

create policy "Users can insert own repos"
  on public.repos for insert
  with check (auth.uid() = user_id);

create policy "Users can update own repos"
  on public.repos for update
  using (auth.uid() = user_id);

create policy "Users can delete own repos"
  on public.repos for delete
  using (auth.uid() = user_id);

-- Reflections policies
create policy "Users can view own reflections"
  on public.reflections for select
  using (
    repo_id in (
      select id from public.repos where user_id = auth.uid()
    )
  );

-- Create indexes
create index if not exists repos_user_id_idx on public.repos(user_id);
create index if not exists repos_is_active_idx on public.repos(is_active);
create index if not exists reflections_repo_id_idx on public.reflections(repo_id);
create index if not exists reflections_date_idx on public.reflections(date);

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

-- Trigger for new user signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated at trigger function
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at triggers
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger repos_updated_at
  before update on public.repos
  for each row execute procedure public.handle_updated_at();
