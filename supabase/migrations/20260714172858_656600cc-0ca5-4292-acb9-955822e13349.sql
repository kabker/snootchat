
-- Avatars: authenticated can read all; users manage own folder (userid/*)
CREATE POLICY "avatars read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "avatars upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "bg read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-backgrounds');
CREATE POLICY "bg upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-backgrounds');
