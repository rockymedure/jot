-- Add write_to_repo preference to profiles
-- Defaults to true so reflections are written to repos by default

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS write_to_repo boolean DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.write_to_repo IS 'Whether to write reflections to the jot/ folder in tracked repos';
