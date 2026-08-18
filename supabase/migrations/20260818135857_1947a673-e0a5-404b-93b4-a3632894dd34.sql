-- 1. Prevent self-escalation of role/status via direct updates: column-level grants
REVOKE UPDATE ON public.chat_members FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.chat_members TO authenticated;
GRANT UPDATE (bubble_color) ON public.chat_members TO authenticated;
GRANT ALL ON public.chat_members TO service_role;

DROP POLICY IF EXISTS "Update own membership prefs" ON public.chat_members;
CREATE POLICY "Update own bubble color"
ON public.chat_members
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND bubble_color = ANY (ARRAY['blue','purple','black','white'])
  AND role = 'member'::text IS NOT FALSE OR role IN ('member','owner')
);

-- 2. Hard guard: block role changes and unauthorized status changes at the trigger level
CREATE OR REPLACE FUNCTION private.chat_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_superuser_ctx boolean := (current_setting('role', true) IS NOT DISTINCT FROM 'none');
BEGIN
  -- Role can never change through a direct table update
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Membership role cannot be changed directly';
  END IF;

  IF NEW.chat_id IS DISTINCT FROM OLD.chat_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Membership identity cannot be changed';
  END IF;

  -- Status may only move from pending -> accepted/declined, by the invited user
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending'
       OR NEW.status NOT IN ('accepted','declined')
       OR OLD.user_id IS DISTINCT FROM COALESCE(auth.uid(), OLD.user_id) THEN
      RAISE EXCEPTION 'Invalid invite status transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.chat_members_guard() FROM PUBLIC, anon, authenticated;

-- 3. Privileged function execute hygiene
REVOKE ALL ON FUNCTION private.bump_chat_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_chat_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_chat_accepted(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.shares_chat_with(uuid, uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.create_dm_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group_chat(text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_to_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_profile_by_username(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.username_available(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_dm_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_profile_by_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO authenticated;

-- 4. Chat background storage: require accepted membership AND ownership of the object
DROP POLICY IF EXISTS "bg upload" ON storage.objects;
DROP POLICY IF EXISTS "bg update" ON storage.objects;
DROP POLICY IF EXISTS "bg read" ON storage.objects;

CREATE POLICY "bg upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-backgrounds'
  AND owner_id = auth.uid()::text
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "bg update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'chat-backgrounds'
  AND owner_id = auth.uid()::text
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'chat-backgrounds'
  AND owner_id = auth.uid()::text
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "bg read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-backgrounds'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
);