-- Add timezone preference to profiles
-- Defaults to 'America/New_York' (Eastern Time)

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York';

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.timezone IS 'User timezone in IANA format (e.g., America/New_York, America/Los_Angeles)';
