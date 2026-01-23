-- Add UPDATE policy for reflections so users can update their own reflections (e.g., for share tokens)
CREATE POLICY "Users can update own reflections"
ON public.reflections
FOR UPDATE
USING (repo_id IN (SELECT id FROM repos WHERE user_id = auth.uid()))
WITH CHECK (repo_id IN (SELECT id FROM repos WHERE user_id = auth.uid()));
