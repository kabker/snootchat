ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS icon_path text;

CREATE TABLE public.nicknames (
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  target_id uuid NOT NULL,
  nickname text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, target_id),
  CONSTRAINT nickname_not_self CHECK (owner_id <> target_id),
  CONSTRAINT nickname_length CHECK (char_length(btrim(nickname)) BETWEEN 1 AND 40)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nicknames TO authenticated;
GRANT ALL ON public.nicknames TO service_role;
ALTER TABLE public.nicknames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own nicknames" ON public.nicknames FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Add own nicknames" ON public.nicknames FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND target_id <> auth.uid());
CREATE POLICY "Edit own nicknames" ON public.nicknames FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid() AND target_id <> auth.uid());
CREATE POLICY "Remove own nicknames" ON public.nicknames FOR DELETE TO authenticated USING (owner_id = auth.uid());