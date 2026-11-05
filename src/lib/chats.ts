import { supabase } from "@/integrations/supabase/client";

export type ChatSummary = {
  chat_id: string;
  is_group: boolean;
  name: string | null;
  updated_at: string;
  status: "pending" | "accepted" | "declined";
  other_members: { id: string; username: string; display_name: string; avatar_url: string | null }[];
  last_message: { body: string; created_at: string; sender_id: string } | null;
};

export async function fetchMyChats(userId: string): Promise<ChatSummary[]> {
  const { data: memberships, error } = await supabase
    .from("chat_members")
    .select("chat_id, status, chats!inner(id, is_group, name, updated_at, icon_path)")
    .eq("user_id", userId);
  if (error) throw error;
  if (!memberships || memberships.length === 0) return [];

  const chatIds = memberships.map((m) => m.chat_id);

  const [{ data: allMembers, error: membersError }, { data: lastMessages, error: messagesError }] = await Promise.all([
    supabase
      .from("chat_members")
      .select("chat_id, user_id")
      .in("chat_id", chatIds),
    supabase
      .from("messages")
      .select("chat_id, body, created_at, sender_id, attachment_path")
      .in("chat_id", chatIds)
      .order("created_at", { ascending: false }),
  ]);
  if (membersError) throw membersError;
  if (messagesError) throw messagesError;

  const profileIds = Array.from(new Set((allMembers ?? []).map((m) => m.user_id)));
  const { data: profiles, error: profilesError } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", profileIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const lastByChat = new Map<string, { body: string; created_at: string; sender_id: string }>();
  (lastMessages ?? []).forEach((m) => {
    if (!lastByChat.has(m.chat_id)) lastByChat.set(m.chat_id, { body: m.attachment_path ? "Photo" : m.body, created_at: m.created_at, sender_id: m.sender_id });
  });

  return memberships
    .map((m) => {
      const chat = m.chats as unknown as { id: string; is_group: boolean; name: string | null; updated_at: string };
      const others = (allMembers ?? [])
        .filter((am) => am.chat_id === m.chat_id && am.user_id !== userId)
        .map((am) => {
          const p = profileById.get(am.user_id);
          return {
            id: am.user_id,
            username: p?.username ?? "unknown",
            display_name: p?.display_name ?? "Snoot user",
            avatar_url: p?.avatar_url ?? null,
          };
        });
      return {
        chat_id: m.chat_id,
        is_group: chat.is_group,
        name: chat.name,
        updated_at: chat.updated_at,
        status: m.status as ChatSummary["status"],
        other_members: others,
        last_message: lastByChat.get(m.chat_id) ?? null,
      };
    })
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1));
}

export async function findUserByUsername(username: string) {
  const { data } = await supabase.rpc("find_profile_by_username", {
    _username: username.toLowerCase(),
  });
  return (data ?? [])[0] ?? null;
}

export async function createDMChat(_currentUserId: string, otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_dm_chat", { other_user_id: otherUserId });
  if (error) throw error;
  return data as string;
}

export async function createGroupChat(_currentUserId: string, name: string, memberIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc("create_group_chat", {
    group_name: name,
    member_ids: memberIds,
  });
  if (error) throw error;
  return data as string;
}

export type ProfileLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export async function searchProfiles(query: string): Promise<ProfileLite[]> {
  const { data, error } = await supabase.rpc("search_profiles", { _q: query });
  if (error) throw error;
  return (data ?? []) as ProfileLite[];
}

export async function getProfileByUsername(username: string): Promise<ProfileLite | null> {
  const { data, error } = await supabase.rpc("find_profile_by_username", {
    _username: username.toLowerCase(),
  });
  if (error) throw error;
  return ((data ?? [])[0] as ProfileLite) ?? null;
}
