import { supabase } from "@/integrations/supabase/client";

// Given a stored value in profiles.avatar_url or chats.background_value,
// return a browser-usable URL. Values can be:
// - full https URL (already public/signed)
// - "bucket:path" form → resolved via signed url
export async function resolveStorageUrl(value: string | null | undefined, bucket: string): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  // treat value as path within bucket
  const { data } = await supabase.storage.from(bucket).createSignedUrl(value, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function uploadFile(bucket: string, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}
