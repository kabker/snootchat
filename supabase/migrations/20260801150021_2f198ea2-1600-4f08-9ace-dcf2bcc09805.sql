-- 1. Storage: chat-backgrounds uploads restricted to accepted members of that chat
DROP POLICY IF EXISTS "bg upload" ON storage.objects;
CREATE POLICY "bg upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-backgrounds'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "bg update" ON storage.objects;
CREATE POLICY "bg update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-backgrounds'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
  )
  WITH CHECK (
    bucket_id = 'chat-backgrounds'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
  );

-- 2. chat_members: block self role/status escalation
DROP POLICY IF EXISTS "Update own membership" ON public.chat_members;
CREATE POLICY "Update own bubble color" ON public.chat_members FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION private.chat_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.chat_id IS DISTINCT FROM OLD.chat_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only bubble_color can be changed directly';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_members_guard ON public.chat_members;
CREATE TRIGGER chat_members_guard BEFORE UPDATE ON public.chat_members
  FOR EACH ROW EXECUTE FUNCTION private.chat_members_guard();

-- Validated invite response
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

-- 3. profiles: restrict broad read access
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;

CREATE OR REPLACE FUNCTION private.shares_chat_with(_other uuid, _me uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_members a
    JOIN public.chat_members b ON a.chat_id = b.chat_id
    WHERE a.user_id = _me AND b.user_id = _other
  );
$$;

CREATE POLICY "Read own or co-member profiles" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.shares_chat_with(id, auth.uid()));

CREATE OR REPLACE FUNCTION public.find_profile_by_username(_username text)
RETURNS TABLE (id uuid, username text, display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.username = lower(_username)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = lower(_username));
$$;

-- 4. Lock down SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.create_dm_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group_chat(text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_to_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_profile_by_username(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.username_available(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.shares_chat_with(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.chat_members_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_chat_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_chat_accepted(uuid, uuid) FROM PUBLIC, anon;
REVOKE USAGE ON SCHEMA private FROM anon;

GRANT EXECUTE ON FUNCTION public.create_dm_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_profile_by_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.shares_chat_with(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_chat_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_chat_accepted(uuid, uuid) TO authenticated;

-- 5. Realtime: restrict channel subscriptions to accepted chat members
DROP POLICY IF EXISTS "Accepted members use chat channels" ON realtime.messages;
CREATE POLICY "Accepted members use chat channels" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'chat-%'
    AND substring(realtime.topic() from 6) ~ '^[0-9a-fA-F-]{36}$'
    AND private.is_chat_accepted(substring(realtime.topic() from 6)::uuid, auth.uid())
  );