-- 1. Strict membership guard (no bypass flag)
CREATE OR REPLACE FUNCTION private.chat_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF current_setting('role', true) = 'service_role' OR me IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.chat_id IS DISTINCT FROM OLD.chat_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
    RAISE EXCEPTION 'Only your own bubble color or invite response can be changed';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.user_id <> me
       OR OLD.status <> 'pending'
       OR NEW.status NOT IN ('accepted', 'declined') THEN
      RAISE EXCEPTION 'Invalid membership status change';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_invite(target_chat_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cur text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF new_status NOT IN ('accepted', 'declined') THEN RAISE EXCEPTION 'invalid status'; END IF;

  SELECT status INTO cur FROM public.chat_members
   WHERE chat_id = target_chat_id AND user_id = me;
  IF cur IS NULL THEN RAISE EXCEPTION 'not invited'; END IF;
  IF cur <> 'pending' THEN RAISE EXCEPTION 'invite already answered'; END IF;

  UPDATE public.chat_members SET status = new_status
   WHERE chat_id = target_chat_id AND user_id = me;
END;
$$;

-- Column-level lockdown: authenticated users may only write bubble_color / status directly
REVOKE UPDATE ON public.chat_members FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.chat_members TO authenticated;
GRANT UPDATE (bubble_color, status) ON public.chat_members TO authenticated;

DROP POLICY IF EXISTS "Update own bubble color" ON public.chat_members;
CREATE POLICY "Update own membership prefs" ON public.chat_members
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND bubble_color = ANY (ARRAY['blue','purple','black','white'])
  AND status = ANY (ARRAY['pending','accepted','declined'])
  AND role = 'member'::text OR role = 'owner'::text
);

DROP POLICY IF EXISTS "Update own membership prefs" ON public.chat_members;
CREATE POLICY "Update own membership prefs" ON public.chat_members
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND bubble_color = ANY (ARRAY['blue','purple','black','white'])
  AND status = ANY (ARRAY['pending','accepted','declined'])
);

-- 2. Profiles: only accepted shared chats reveal a profile
CREATE OR REPLACE FUNCTION private.shares_chat_with(_other uuid, _me uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_members a
    JOIN public.chat_members b ON a.chat_id = b.chat_id
    WHERE a.user_id = _me AND a.status = 'accepted'
      AND b.user_id = _other AND b.status IN ('accepted','pending')
  );
$$;

-- 3. Storage: stricter uuid folder matching for chat backgrounds
DROP POLICY IF EXISTS "bg read" ON storage.objects;
DROP POLICY IF EXISTS "bg upload" ON storage.objects;
DROP POLICY IF EXISTS "bg update" ON storage.objects;

CREATE POLICY "bg read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-backgrounds'
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "bg upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-backgrounds'
  AND owner_id = (auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "bg update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'chat-backgrounds'
  AND owner_id = (auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'chat-backgrounds'
  AND owner_id = (auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- 4. Minimal execute rights on definer functions
REVOKE ALL ON FUNCTION private.chat_members_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bump_chat_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.shares_chat_with(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_chat_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_chat_accepted(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.shares_chat_with(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_chat_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_chat_accepted(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.respond_to_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_dm_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group_chat(text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_profile_by_username(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.username_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_dm_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_profile_by_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO authenticated;