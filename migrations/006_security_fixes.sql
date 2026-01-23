-- Security fixes: Add missing RLS policies
-- Note: Use DO block for conditional policy creation

DO $$
BEGIN
  -- Allow users to update their own reflections (needed for share token)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reflections' AND policyname = 'Users can update own reflections'
  ) THEN
    CREATE POLICY "Users can update own reflections"
      ON public.reflections FOR UPDATE
      USING (
        repo_id IN (
          SELECT id FROM public.repos WHERE user_id = auth.uid()
        )
      );
  END IF;

  -- Add policy for deleting reflections
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reflections' AND policyname = 'Users can delete own reflections'
  ) THEN
    CREATE POLICY "Users can delete own reflections"
      ON public.reflections FOR DELETE
      USING (
        repo_id IN (
          SELECT id FROM public.repos WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
