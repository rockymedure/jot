-- Add share token for public sharing of reflections
ALTER TABLE public.reflections
ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

-- Index for fast lookups by share token
CREATE INDEX IF NOT EXISTS idx_reflections_share_token ON public.reflections(share_token)
WHERE share_token IS NOT NULL;
