CREATE OR REPLACE FUNCTION private.shares_chat_with(_other uuid, _me uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members a
    JOIN public.chat_members b ON a.chat_id = b.chat_id
    WHERE a.user_id = _me
      AND b.user_id = _other
      AND ((a.status = 'accepted' AND b.status IN ('accepted','pending'))
        OR (a.status = 'pending' AND b.user_id = a.invited_by))
  );
$function$;

CREATE TABLE public.account_merge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  target_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  used_at timestamptz
);
GRANT ALL ON public.account_merge_requests TO service_role;
ALTER TABLE public.account_merge_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.merge_accounts(_source uuid, _target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record; t uuid; dead uuid[];
BEGIN
  IF _source = _target THEN RAISE EXCEPTION 'same account'; END IF;

  -- DMs between the two accounts disappear
  SELECT array_agg(c.id) INTO dead FROM public.chats c
   WHERE c.is_group = false
     AND EXISTS (SELECT 1 FROM public.chat_members m WHERE m.chat_id=c.id AND m.user_id=_source)
     AND EXISTS (SELECT 1 FROM public.chat_members m WHERE m.chat_id=c.id AND m.user_id=_target);

  -- DMs with the same person get combined into the target's DM
  FOR r IN SELECT c.id AS cid, o.user_id AS other FROM public.chats c
    JOIN public.chat_members s ON s.chat_id=c.id AND s.user_id=_source
    JOIN public.chat_members o ON o.chat_id=c.id AND o.user_id<>_source
    WHERE c.is_group=false AND NOT (c.id = ANY(coalesce(dead,'{}')))
  LOOP
    SELECT c2.id INTO t FROM public.chats c2
      JOIN public.chat_members a ON a.chat_id=c2.id AND a.user_id=_target
      JOIN public.chat_members b ON b.chat_id=c2.id AND b.user_id=r.other
      WHERE c2.is_group=false LIMIT 1;
    IF t IS NOT NULL THEN
      UPDATE public.messages SET chat_id=t WHERE chat_id=r.cid;
      UPDATE public.chats SET updated_at=now() WHERE id=t;
      dead := array_append(coalesce(dead,'{}'), r.cid);
    END IF;
  END LOOP;

  IF dead IS NOT NULL THEN
    DELETE FROM public.call_signals WHERE call_id IN (SELECT id FROM public.chat_calls WHERE chat_id = ANY(dead));
    DELETE FROM public.call_participants WHERE call_id IN (SELECT id FROM public.chat_calls WHERE chat_id = ANY(dead));
    DELETE FROM public.chat_calls WHERE chat_id = ANY(dead);
    DELETE FROM public.messages WHERE chat_id = ANY(dead);
    DELETE FROM public.chat_members WHERE chat_id = ANY(dead);
    DELETE FROM public.chats WHERE id = ANY(dead);
  END IF;

  -- Move remaining memberships
  INSERT INTO public.chat_members (chat_id, user_id, status, bubble_color, role, invited_by, created_at)
    SELECT chat_id, _target, status, bubble_color, role, NULLIF(invited_by,_target), created_at
    FROM public.chat_members WHERE user_id=_source
    ON CONFLICT DO NOTHING;
  DELETE FROM public.chat_members WHERE user_id=_source;

  DELETE FROM public.call_signals WHERE sender_id=_source OR recipient_id=_source;
  DELETE FROM public.call_participants WHERE user_id=_source;
  UPDATE public.chat_calls SET caller_id=_target WHERE caller_id=_source;
  UPDATE public.messages SET sender_id=_target WHERE sender_id=_source;
  UPDATE public.chats SET created_by=_target WHERE created_by=_source;
  UPDATE public.chat_members SET invited_by=_target WHERE invited_by=_source;
  DELETE FROM public.profiles WHERE id=_source;
END; $$;

REVOKE ALL ON FUNCTION public.merge_accounts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_accounts(uuid, uuid) TO service_role;