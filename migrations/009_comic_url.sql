-- Add comic_url column to reflections
ALTER TABLE public.reflections
ADD COLUMN IF NOT EXISTS comic_url TEXT;

-- Add comment
COMMENT ON COLUMN public.reflections.comic_url IS 'URL to the AI-generated comic strip for this reflection';
