CREATE OR REPLACE FUNCTION public.search_profiles(_q text)
RETURNS TABLE (id uuid, username text, display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND length(coalesce(_q, '')) >= 1
    AND p.id <> auth.uid()
    AND (p.username ILIKE (_q || '%') OR p.display_name ILIKE ('%' || _q || '%'))
  ORDER BY (p.username ILIKE (_q || '%')) DESC, p.username
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;