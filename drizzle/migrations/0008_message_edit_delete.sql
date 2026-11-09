ALTER TABLE public.messages ADD COLUMN edited_at timestamptz, ADD COLUMN deleted_at timestamptz;
CREATE OR REPLACE FUNCTION public.guard_message_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.chat_id <> OLD.chat_id OR NEW.sender_id <> OLD.sender_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Messages cannot be moved';
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body OR NEW.attachment_path IS DISTINCT FROM OLD.attachment_path
     OR NEW.edited_at IS DISTINCT FROM OLD.edited_at OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    IF auth.uid() IS DISTINCT FROM OLD.sender_id THEN RAISE EXCEPTION 'Only the sender can edit or delete this message'; END IF;
    IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'This message was deleted'; END IF;
    IF NEW.deleted_at IS NOT NULL THEN NEW.body := ''; NEW.attachment_path := NULL; NEW.edited_at := OLD.edited_at;
    ELSIF NEW.body IS DISTINCT FROM OLD.body THEN
      IF length(trim(NEW.body)) = 0 OR length(NEW.body) > 4000 THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
      NEW.attachment_path := OLD.attachment_path; NEW.edited_at := now();
    ELSE NEW.attachment_path := OLD.attachment_path; NEW.edited_at := OLD.edited_at; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_message_update() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_message_update BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();