-- Add webhook tracking columns to repos table
ALTER TABLE public.repos
ADD COLUMN IF NOT EXISTS last_push_at timestamptz,
ADD COLUMN IF NOT EXISTS webhook_id bigint,
ADD COLUMN IF NOT EXISTS webhook_secret text;

-- Index for efficient inactivity queries
CREATE INDEX IF NOT EXISTS idx_repos_last_push_at ON public.repos(last_push_at)
WHERE is_active = true AND last_push_at IS NOT NULL;
