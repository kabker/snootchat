import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, Video, Users, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyChats, type ChatSummary } from "@/lib/chats";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { useCalls } from "@/components/CallProvider";

export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({ meta: [
    { title: "Calls · SnootChat" },
    { name: "description", content: "Your recent voice and video calls and contacts on SnootChat." },
    { property: "og:title", content: "Calls · SnootChat" },
    { property: "og:description", content: "Your recent voice and video calls and contacts on SnootChat." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CallsPage,
});

type CallRow = { id: string; chat_id: string; caller_id: string; kind: string; created_at: string };

function CallsPage() {
  const { userId } = Route.useRouteContext();
  const { startCall, busy } = useCalls();
  const [showContacts, setShowContacts] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [mine, { data }] = await Promise.all([
        fetchMyChats(userId).catch(() => []),
        supabase.from("chat_calls").select("id, chat_id, caller_id, kind, created_at").order("created_at", { ascending: false }).limit(100),
      ]);
      setChats(mine.filter(c => c.status === "accepted"));
      setCalls(data ?? []);
      setLoading(false);
    })();
  }, [userId]);

  const chatById = new Map(chats.map(c => [c.chat_id, c]));
  const titleOf = (c?: ChatSummary) => !c ? "Call" : c.is_group ? c.name || "Group" : c.other_members[0]?.display_name || "Call";
  const contacts = Array.from(new Map(chats.flatMap(c => c.other_members).map(m => [m.id, m])).values()).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const dmFor = (id: string) => chats.find(c => !c.is_group && c.other_members[0]?.id === id);

  return <div className="h-dvh md:h-full max-w-2xl mx-auto flex flex-col">
    <header className="flex items-center gap-3 px-5 py-3 border-b border-border">
      <h1 className="text-2xl font-bold flex-1">{showContacts ? "Contacts" : "Calls"}</h1>
      <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setShowContacts(v => !v)} aria-pressed={showContacts}>
        {showContacts ? <><History /> Call log</> : <><Users /> Contacts</>}
      </Button>
    </header>
    <div className="flex-1 overflow-y-auto pb-24 md:pb-6">
      {loading ? <p className="p-6 text-center text-muted-foreground">Loading…</p>
      : showContacts ? (contacts.length === 0 ? <p className="p-6 text-center text-muted-foreground">People you chat with will show up here.</p> :
        <ul>{contacts.map(p => { const dm = dmFor(p.id); return <li key={p.id} className="flex items-center gap-3 px-5 py-3">
          <Link to="/u/$username" params={{ username: p.username }} className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar displayName={p.display_name} avatarPath={p.avatar_url} size={44} />
            <div className="min-w-0"><p className="font-medium truncate">{p.display_name}</p><p className="text-sm text-muted-foreground truncate">@{p.username}</p></div>
          </Link>
          {dm && <><Button variant="ghost" size="icon" aria-label={`Voice call ${p.display_name}`} disabled={busy} onClick={() => void startCall(dm.chat_id, "voice")}><Phone /></Button>
          <Button variant="ghost" size="icon" aria-label={`Video call ${p.display_name}`} disabled={busy} onClick={() => void startCall(dm.chat_id, "video")}><Video /></Button></>}
        </li>; })}</ul>)
      : calls.length === 0 ? <p className="p-6 text-center text-muted-foreground">No calls yet.</p> :
        <ul>{calls.map(call => { const chat = chatById.get(call.chat_id); const outgoing = call.caller_id === userId; const title = titleOf(chat); const kind = call.kind === "video" ? "video" : "voice"; return <li key={call.id} className="flex items-center gap-3 px-5 py-3">
          <Link to="/chats/$chatId" params={{ chatId: call.chat_id }} className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar displayName={title} avatarPath={chat?.is_group ? chat.icon_path : chat?.other_members[0]?.avatar_url} bucket={chat?.is_group ? "chat-backgrounds" : undefined} size={44} />
            <div className="min-w-0"><p className="font-medium truncate">{title}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">{outgoing ? <PhoneOutgoing className="size-3.5" /> : <PhoneIncoming className="size-3.5" />}{outgoing ? "Outgoing" : "Incoming"} {kind} · {new Date(call.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div>
          </Link>
          <Button variant="ghost" size="icon" aria-label={`Call ${title} again`} disabled={busy || !chat} onClick={() => void startCall(call.chat_id, kind)}>{kind === "video" ? <Video /> : <Phone />}</Button>
        </li>; })}</ul>}
    </div>
    <BottomNav />
  </div>;
}
