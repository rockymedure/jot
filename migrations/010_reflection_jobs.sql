-- Migration: Add reflection_jobs table for scalable job queue processing
-- This replaces the monolithic cron with a scheduler/worker pattern

create table public.reflection_jobs (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid references public.repos(id) on delete cascade,
  work_date date not null,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer default 0,
  max_attempts integer default 3,
  last_error text,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique(repo_id, work_date)
);

-- Index for fast pending job lookup
create index idx_reflection_jobs_pending on public.reflection_jobs(status, created_at) 
  where status = 'pending';

-- Index for stale job recovery (processing jobs that got stuck)
create index idx_reflection_jobs_processing on public.reflection_jobs(status, started_at) 
  where status = 'processing';

-- Index for cleanup/analytics
create index idx_reflection_jobs_completed on public.reflection_jobs(completed_at) 
  where status = 'completed';

-- RLS policies (service role bypasses, but good to have)
alter table public.reflection_jobs enable row level security;

-- Allow service role full access (for cron jobs)
create policy "Service role can manage jobs"
  on public.reflection_jobs
  for all
  using (true)
  with check (true);

comment on table public.reflection_jobs is 'Job queue for reflection generation. Scheduler creates pending jobs, workers process them.';
comment on column public.reflection_jobs.status is 'pending = waiting, processing = being worked on, completed = done, failed = gave up after max_attempts';
comment on column public.reflection_jobs.attempts is 'Number of times this job has been attempted';
comment on column public.reflection_jobs.last_error is 'Error message from the last failed attempt';

-- Function to atomically claim a pending job using SKIP LOCKED
-- This allows multiple workers to run concurrently without conflicts
create or replace function public.claim_reflection_job()
returns table (
  id uuid,
  repo_id uuid,
  work_date date,
  attempts integer
)
language plpgsql
security definer
as $$
begin
  return query
  update public.reflection_jobs
  set 
    status = 'processing',
    started_at = now(),
    attempts = reflection_jobs.attempts + 1
  where reflection_jobs.id = (
    select rj.id
    from public.reflection_jobs rj
    where rj.status = 'pending'
    order by rj.created_at asc
    limit 1
    for update skip locked
  )
  returning 
    reflection_jobs.id,
    reflection_jobs.repo_id,
    reflection_jobs.work_date,
    reflection_jobs.attempts;
end;
$$;
