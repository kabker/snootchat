
-- Fix the broken chat_members INSERT policy
DROP POLICY IF EXISTS "Add members to chat" ON public.chat_members;

CREATE POLICY "Add members to chat"
ON public.chat_members
FOR INSERT
TO authenticated
WITH CHECK (
  -- You can add yourself to a chat you just created
  (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.chats c WHERE c.id = chat_id AND c.created_by = auth.uid()
  ))
  -- Or an accepted member can invite others
  OR private.is_chat_accepted(chat_id, auth.uid())
);

-- Atomic DM creation
CREATE OR REPLACE FUNCTION public.create_dm_chat(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  existing_id uuid;
  new_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF other_user_id = me THEN RAISE EXCEPTION 'cannot chat yourself'; END IF;

  -- Look for existing DM
  SELECT c.id INTO existing_id
  FROM public.chats c
  WHERE c.is_group = false
    AND EXISTS (SELECT 1 FROM public.chat_members m1 WHERE m1.chat_id = c.id AND m1.user_id = me)
    AND EXISTS (SELECT 1 FROM public.chat_members m2 WHERE m2.chat_id = c.id AND m2.user_id = other_user_id)
  LIMIT 1;

  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  INSERT INTO public.chats (is_group, created_by) VALUES (false, me) RETURNING id INTO new_id;
  INSERT INTO public.chat_members (chat_id, user_id, status, role) VALUES (new_id, me, 'accepted', 'owner');
  INSERT INTO public.chat_members (chat_id, user_id, status, invited_by) VALUES (new_id, other_user_id, 'pending', me);

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_dm_chat(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_group_chat(group_name text, member_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  new_id uuid;
  uid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  INSERT INTO public.chats (is_group, name, created_by) VALUES (true, group_name, me) RETURNING id INTO new_id;
  INSERT INTO public.chat_members (chat_id, user_id, status, role) VALUES (new_id, me, 'accepted', 'owner');
  FOREACH uid IN ARRAY member_ids LOOP
    IF uid <> me THEN
      INSERT INTO public.chat_members (chat_id, user_id, status, invited_by)
      VALUES (new_id, uid, 'pending', me)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]) TO authenticated;
