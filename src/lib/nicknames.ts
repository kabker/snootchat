import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const listeners = new Set<(m: Map<string, string>) => void>();
let cache = new Map<string, string>();

export async function refreshNicknames() {
  const { data } = await supabase.from("nicknames").select("target_id, nickname");
  cache = new Map((data ?? []).map((r) => [r.target_id, r.nickname]));
  listeners.forEach((l) => l(cache));
}

/** Nicknames the signed-in user gave others; private to them, synced via their account. */
export function useNicknames() {
  const [map, setMap] = useState(cache);
  useEffect(() => {
    listeners.add(setMap);
    void refreshNicknames();
    return () => { listeners.delete(setMap); };
  }, []);
  return map;
}

export async function saveNickname(ownerId: string, targetId: string, nickname: string) {
  if (ownerId === targetId) throw new Error("You can't nickname yourself");
  const value = nickname.trim().slice(0, 40);
  const { error } = value
    ? await supabase.from("nicknames").upsert({ owner_id: ownerId, target_id: targetId, nickname: value, updated_at: new Date().toISOString() })
    : await supabase.from("nicknames").delete().eq("owner_id", ownerId).eq("target_id", targetId);
  if (error) throw error;
  await refreshNicknames();
}
