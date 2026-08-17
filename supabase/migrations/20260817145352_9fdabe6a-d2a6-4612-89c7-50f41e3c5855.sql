CREATE OR REPLACE FUNCTION private.chat_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR coalesce(current_setting('app.allow_member_status_change', true), '') = 'on' THEN
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

  PERFORM set_config('app.allow_member_status_change', 'on', true);
  UPDATE public.chat_members SET status = new_status
   WHERE chat_id = target_chat_id AND user_id = me;
  PERFORM set_config('app.allow_member_status_change', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_invite(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_invite(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION private.chat_members_guard() FROM PUBLIC, anon, authenticated;