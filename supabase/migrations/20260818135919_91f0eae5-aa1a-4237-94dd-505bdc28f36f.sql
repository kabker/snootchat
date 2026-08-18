DROP POLICY IF EXISTS "Update own bubble color" ON public.chat_members;
CREATE POLICY "Update own bubble color"
ON public.chat_members
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND bubble_color = ANY (ARRAY['blue','purple','black','white'])
);