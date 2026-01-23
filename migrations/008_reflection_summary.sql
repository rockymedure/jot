-- Add summary column to reflections table
-- This stores an LLM-generated one-line summary of the reflection

ALTER TABLE public.reflections
ADD COLUMN IF NOT EXISTS summary text;

-- Backfill: we'll generate summaries for existing reflections via a separate process
COMMENT ON COLUMN public.reflections.summary IS 'LLM-generated one-line summary of the reflection for dashboard display';
