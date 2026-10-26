CREATE TABLE public.chat_calls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
 caller_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('voice','video')), status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 seconds')
);
GRANT SELECT ON public.chat_calls TO authenticated;
GRANT ALL ON public.chat_calls TO service_role;
ALTER TABLE public.chat_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accepted members read calls" ON public.chat_calls FOR SELECT TO authenticated USING (private.is_chat_accepted(chat_id, auth.uid()));
CREATE INDEX chat_calls_room_idx ON public.chat_calls(chat_id,created_at DESC);
CREATE TABLE public.call_participants (
 call_id uuid NOT NULL REFERENCES public.chat_calls(id) ON DELETE CASCADE, user_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'joined' CHECK (state IN ('joined','left')), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(call_id,user_id)
);
GRANT SELECT, INSERT ON public.call_participants TO authenticated;
GRANT UPDATE (state,updated_at) ON public.call_participants TO authenticated;
GRANT ALL ON public.call_participants TO service_role;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read call participants" ON public.call_participants FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.chat_calls c WHERE c.id=call_id AND private.is_chat_accepted(c.chat_id,auth.uid())));
CREATE POLICY "Members join calls themselves" ON public.call_participants FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.chat_calls c WHERE c.id=call_id AND c.status='active' AND c.expires_at>now() AND private.is_chat_accepted(c.chat_id,auth.uid())));
CREATE POLICY "Members update own participation" ON public.call_participants FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.chat_calls c WHERE c.id=call_id AND private.is_chat_accepted(c.chat_id,auth.uid())));
CREATE TABLE public.call_signals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), call_id uuid NOT NULL REFERENCES public.chat_calls(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL, recipient_id uuid NOT NULL, payload jsonb NOT NULL CHECK (octet_length(payload::text)<65536), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants receive own signals" ON public.call_signals FOR SELECT TO authenticated USING (recipient_id=auth.uid() AND EXISTS (SELECT 1 FROM public.chat_calls c WHERE c.id=call_id AND private.is_chat_accepted(c.chat_id,auth.uid())));
CREATE POLICY "Participants remove received signals" ON public.call_signals FOR DELETE TO authenticated USING (recipient_id=auth.uid());
CREATE POLICY "Joined participants signal each other" ON public.call_signals FOR INSERT TO authenticated WITH CHECK (sender_id=auth.uid() AND sender_id<>recipient_id AND EXISTS (SELECT 1 FROM public.chat_calls c WHERE c.id=call_id AND c.status='active' AND c.expires_at>now() AND private.is_chat_accepted(c.chat_id,auth.uid()) AND EXISTS(SELECT 1 FROM public.call_participants p WHERE p.call_id=c.id AND p.user_id=auth.uid() AND p.state='joined' AND p.updated_at>now()-interval '90 seconds') AND EXISTS(SELECT 1 FROM public.call_participants p WHERE p.call_id=c.id AND p.user_id=recipient_id AND p.state='joined' AND p.updated_at>now()-interval '90 seconds')));
CREATE INDEX call_signals_recipient_idx ON public.call_signals(recipient_id,call_id,created_at);
CREATE OR REPLACE FUNCTION public.start_chat_call(target_chat_id uuid, call_kind text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE call_uuid uuid; me uuid:=auth.uid();
BEGIN
 IF me IS NULL OR NOT private.is_chat_accepted(target_chat_id,me) THEN RAISE EXCEPTION 'Accept this chat invitation before calling'; END IF;
 IF call_kind NOT IN ('voice','video') THEN RAISE EXCEPTION 'Invalid call type'; END IF;
 PERFORM 1 FROM public.chats WHERE id=target_chat_id FOR UPDATE;
 SELECT id INTO call_uuid FROM public.chat_calls WHERE chat_id=target_chat_id AND status='active' AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
 IF call_uuid IS NULL THEN INSERT INTO public.chat_calls(chat_id,caller_id,kind) VALUES(target_chat_id,me,call_kind) RETURNING id INTO call_uuid; END IF;
 RETURN call_uuid;
END; $$;
REVOKE ALL ON FUNCTION public.start_chat_call(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_chat_call(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.refresh_call_participation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.updated_at:=now();
 IF NEW.state='joined' THEN
   IF NOT EXISTS(SELECT 1 FROM public.chat_calls c WHERE c.id=NEW.call_id AND c.status='active' AND c.expires_at>now()) THEN RAISE EXCEPTION 'Call has ended'; END IF;
   UPDATE public.chat_calls SET expires_at=now()+interval '90 seconds' WHERE id=NEW.call_id;
 ELSE
   UPDATE public.chat_calls SET status='ended' WHERE id=NEW.call_id AND NOT EXISTS(SELECT 1 FROM public.call_participants p WHERE p.call_id=NEW.call_id AND p.user_id<>NEW.user_id AND p.state='joined' AND p.updated_at>now()-interval '90 seconds');
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_call_participation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER call_participation_heartbeat BEFORE INSERT OR UPDATE ON public.call_participants FOR EACH ROW EXECUTE FUNCTION public.refresh_call_participation();
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_calls, public.call_participants, public.call_signals;
ALTER TABLE public.messages ADD COLUMN attachment_path text;
ALTER TABLE public.messages ADD CONSTRAINT image_attachment_path CHECK (attachment_path IS NULL OR (attachment_path LIKE chat_id::text || '/' || sender_id::text || '/%' AND attachment_path ~ '\.(png|jpg|jpeg|gif|webp)$'));
CREATE POLICY "Members view chat images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='chat-images' AND EXISTS(SELECT 1 FROM public.chat_members m WHERE m.chat_id::text=(storage.foldername(name))[1] AND m.user_id=auth.uid() AND m.status='accepted'));
CREATE POLICY "Members upload own chat images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='chat-images' AND owner_id=auth.uid()::text AND (storage.foldername(name))[2]=auth.uid()::text AND lower(storage.extension(name)) IN ('png','jpg','jpeg','gif','webp') AND EXISTS(SELECT 1 FROM public.chat_members m WHERE m.chat_id::text=(storage.foldername(name))[1] AND m.user_id=auth.uid() AND m.status='accepted'));
CREATE POLICY "Members remove own chat images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='chat-images' AND owner_id=auth.uid()::text AND (storage.foldername(name))[2]=auth.uid()::text);
