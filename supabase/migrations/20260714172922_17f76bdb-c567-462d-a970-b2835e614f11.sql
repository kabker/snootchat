
CREATE SCHEMA IF NOT EXISTS private;
ALTER FUNCTION public.is_chat_member(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_chat_accepted(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.bump_chat_updated_at() SET SCHEMA private;

-- Rewrite policies to reference the new schema
DROP POLICY IF EXISTS "Members see their chats" ON public.chats;
DROP POLICY IF EXISTS "Accepted members update chat" ON public.chats;
DROP POLICY IF EXISTS "See members of my chats" ON public.chat_members;
DROP POLICY IF EXISTS "Add members to chat" ON public.chat_members;
DROP POLICY IF EXISTS "Accepted members read messages" ON public.messages;
DROP POLICY IF EXISTS "Accepted members send messages" ON public.messages;
DROP POLICY IF EXISTS "Accepted members update delivery" ON public.messages;

CREATE POLICY "Members see their chats" ON public.chats FOR SELECT TO authenticated
  USING (private.is_chat_member(id, auth.uid()));
CREATE POLICY "Accepted members update chat" ON public.chats FOR UPDATE TO authenticated
  USING (private.is_chat_accepted(id, auth.uid()));

CREATE POLICY "See members of my chats" ON public.chat_members FOR SELECT TO authenticated
  USING (private.is_chat_member(chat_id, auth.uid()));
CREATE POLICY "Add members to chat" ON public.chat_members FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.chat_members m WHERE m.chat_id = chat_id))
    OR private.is_chat_accepted(chat_id, auth.uid())
  );

CREATE POLICY "Accepted members read messages" ON public.messages FOR SELECT TO authenticated
  USING (private.is_chat_accepted(chat_id, auth.uid()));
CREATE POLICY "Accepted members send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND private.is_chat_accepted(chat_id, auth.uid()));
CREATE POLICY "Accepted members update delivery" ON public.messages FOR UPDATE TO authenticated
  USING (private.is_chat_accepted(chat_id, auth.uid()));

-- Recreate trigger against the moved function
DROP TRIGGER IF EXISTS bump_chat_on_message ON public.messages;
CREATE TRIGGER bump_chat_on_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.bump_chat_updated_at();

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_chat_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_chat_accepted(uuid, uuid) TO authenticated;
