
-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- CHATS
CREATE TABLE public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group boolean NOT NULL DEFAULT false,
  name text,
  background_type text NOT NULL DEFAULT 'preset',
  background_value text NOT NULL DEFAULT 'aurora',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- CHAT MEMBERS
CREATE TABLE public.chat_members (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  bubble_color text NOT NULL DEFAULT 'blue' CHECK (bubble_color IN ('blue','purple','black','white')),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','owner')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_members TO authenticated;
GRANT ALL ON public.chat_members TO service_role;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;

-- security definer helpers to avoid recursion
CREATE OR REPLACE FUNCTION public.is_chat_member(_chat uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_members WHERE chat_id=_chat AND user_id=_user);
$$;

CREATE OR REPLACE FUNCTION public.is_chat_accepted(_chat uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_members WHERE chat_id=_chat AND user_id=_user AND status='accepted');
$$;

-- CHATS policies
CREATE POLICY "Members see their chats" ON public.chats FOR SELECT TO authenticated
  USING (public.is_chat_member(id, auth.uid()));
CREATE POLICY "Users create chats" ON public.chats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Accepted members update chat" ON public.chats FOR UPDATE TO authenticated
  USING (public.is_chat_accepted(id, auth.uid()));

-- CHAT_MEMBERS policies
CREATE POLICY "See members of my chats" ON public.chat_members FOR SELECT TO authenticated
  USING (public.is_chat_member(chat_id, auth.uid()));
-- The creator inserts themselves as owner/accepted; accepted members can invite others (pending)
CREATE POLICY "Add members to chat" ON public.chat_members FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.chat_members m WHERE m.chat_id = chat_id))
    OR public.is_chat_accepted(chat_id, auth.uid())
  );
CREATE POLICY "Update own membership" ON public.chat_members FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Leave own membership" ON public.chat_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- MESSAGES
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_chat_created_idx ON public.messages(chat_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accepted members read messages" ON public.messages FOR SELECT TO authenticated
  USING (public.is_chat_accepted(chat_id, auth.uid()));
CREATE POLICY "Accepted members send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.is_chat_accepted(chat_id, auth.uid()));
CREATE POLICY "Accepted members update delivery" ON public.messages FOR UPDATE TO authenticated
  USING (public.is_chat_accepted(chat_id, auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_members REPLICA IDENTITY FULL;

-- Bump chat updated_at on new message
CREATE OR REPLACE FUNCTION public.bump_chat_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chats SET updated_at = now() WHERE id = NEW.chat_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER bump_chat_on_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_chat_updated_at();
