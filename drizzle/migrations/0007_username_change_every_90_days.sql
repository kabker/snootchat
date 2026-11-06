ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_username_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username AND current_setting('snoot.username_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use the username change option to change your username';
  END IF;
  IF current_setting('snoot.username_rpc', true) IS DISTINCT FROM 'on' THEN
    NEW.username_changed_at := OLD.username_changed_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_username_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_username_change ON public.profiles;
CREATE TRIGGER guard_username_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_username_change();

CREATE OR REPLACE FUNCTION public.change_username(new_username text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE last_change timestamptz; clean text := lower(trim(new_username));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF clean !~ '^[a-z0-9_.]{3,30}$' THEN RAISE EXCEPTION 'Usernames are 3-30 letters, numbers, dots or underscores'; END IF;
  SELECT username_changed_at INTO last_change FROM profiles WHERE id = auth.uid();
  IF last_change IS NOT NULL AND last_change > now() - interval '90 days' THEN
    RAISE EXCEPTION 'You can change your username again on %', to_char(last_change + interval '90 days', 'Mon DD, YYYY');
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE lower(username) = clean AND id <> auth.uid()) THEN RAISE EXCEPTION 'Username is taken'; END IF;
  PERFORM set_config('snoot.username_rpc', 'on', true);
  UPDATE profiles SET username = clean, username_changed_at = now() WHERE id = auth.uid();
  PERFORM set_config('snoot.username_rpc', 'off', true);
END $$;
REVOKE ALL ON FUNCTION public.change_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;