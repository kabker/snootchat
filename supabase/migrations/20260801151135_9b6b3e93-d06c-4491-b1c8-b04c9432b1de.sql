-- 1. chat_members: column-level lockdown so only bubble_color can be updated
REVOKE UPDATE ON public.chat_members FROM authenticated;
GRANT UPDATE (bubble_color) ON public.chat_members TO authenticated;

DROP POLICY IF EXISTS "Update own bubble color" ON public.chat_members;
CREATE POLICY "Update own bubble color"
ON public.chat_members
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND bubble_color IN ('blue','purple','black','white')
);

-- 2. storage: chat-backgrounds strictly scoped to accepted members of the folder's chat
DROP POLICY IF EXISTS "bg upload" ON storage.objects;
DROP POLICY IF EXISTS "bg update" ON storage.objects;
DROP POLICY IF EXISTS "bg read" ON storage.objects;
DROP POLICY IF EXISTS "bg delete" ON storage.objects;

CREATE POLICY "bg read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-backgrounds'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "bg upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-backgrounds'
  AND owner_id = (auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "bg update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-backgrounds'
  AND owner_id = (auth.uid())::text
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'chat-backgrounds'
  AND owner_id = (auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND private.is_chat_accepted(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- 3. profiles: keep reads limited to self / co-members and make avatar reads non-public
DROP POLICY IF EXISTS "avatars read" ON storage.objects;
CREATE POLICY "avatars read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- 4. trigger-only SECURITY DEFINER functions must not be callable by API roles
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT n.nspname, p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname IN ('bump_chat_updated_at','chat_members_guard')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;
