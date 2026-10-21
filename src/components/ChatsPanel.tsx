import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyChats, createDMChat, createGroupChat, type ChatSummary, type ProfileLite } from "@/lib/chats";
import { UserSearch } from "@/components/UserSearch";
import { Avatar } from "@/components/Avatar";
import logo from "@/assets/snoot-logo.png";
import { Button } from "@/components/ui/button";
import { Search, SquarePen, Users, X } from "lucide-react";

export function ChatsPanel({ userId, activeChatId }: { userId: string; activeChatId?: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"chats" | "requests">("chats");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    try {
      const rows = await fetchMyChats(userId);
      setChats(rows);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`user-updates-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const accepted = chats.filter((c) => c.status === "accepted" && `${c.name ?? ""} ${c.other_members.map((m) => `${m.display_name} ${m.username}`).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const pending = chats.filter((c) => c.status === "pending");

  async function handleAccept(chatId: string) {
    const { error } = await supabase.rpc("respond_to_invite", {
      target_chat_id: chatId,
      new_status: "accepted",
    });
    if (error) return toast.error(error.message);
    toast.success("Request accepted");
    load();
  }
  async function handleDecline(chatId: string) {
    const { error } = await supabase
      .from("chat_members")
      .delete()
      .eq("chat_id", chatId)
      .eq("user_id", userId);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="h-full flex flex-col px-3 pb-20 md:pb-3">
      <header className="flex items-center justify-between py-5 shrink-0 bg-background z-10">
        <div className="flex items-center gap-2">
          
          <h1 className="text-2xl font-bold">Chats</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowNew(true)}
            variant="secondary" size="icon" className="rounded-full"
            aria-label="New chat"
          >
            <SquarePen className="w-5 h-5" />
          </Button>

        </div>
      </header>

      <label className="flex items-center gap-2 rounded-full bg-input px-3 py-2.5 shrink-0">
        <Search className="size-4 text-muted-foreground" />
        <input aria-label="Search chats" placeholder="Search chats" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full min-w-0 bg-transparent text-sm outline-none" />
      </label>
      <div className="flex gap-2 my-3 shrink-0">
        <Button variant="ghost"
          onClick={() => setTab("chats")}
          className={`flex-1 py-2 rounded-full text-sm font-medium ${tab === "chats" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"}`}
        >
          Chats {accepted.length > 0 && `(${accepted.length})`}
        </Button>
        <Button variant="ghost"
          onClick={() => setTab("requests")}
          className={`flex-1 py-2 rounded-full text-sm font-medium ${tab === "requests" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"}`}
        >
          Requests {pending.length > 0 && `(${pending.length})`}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {loading ? (
        <p className="text-muted-foreground text-center py-10">Loading…</p>
      ) : tab === "chats" ? (
        accepted.length === 0 ? (
          search ? <p className="py-10 text-center text-sm text-muted-foreground">No matching chats.</p> : <EmptyState onNew={() => setShowNew(true)} />
        ) : (
          <ul className="space-y-1">
            {accepted.map((c) => (
              <li key={c.chat_id}>
                <ChatRow chat={c} active={activeChatId === c.chat_id} onOpen={() => navigate({ to: "/chats/$chatId", params: { chatId: c.chat_id } })} />
              </li>
            ))}
          </ul>
        )
      ) : pending.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">No pending requests.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((c) => (
            <li key={c.chat_id} className="rounded-xl hover:bg-secondary p-3 flex items-center gap-3">
              <Avatar
                displayName={c.is_group ? c.name ?? "Group" : c.other_members[0]?.display_name ?? "?"}
                avatarPath={c.is_group ? null : c.other_members[0]?.avatar_url}
                size={44}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {c.is_group ? c.name ?? "Group chat" : c.other_members[0]?.display_name ?? "Someone"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.is_group ? "wants to add you to a group" : "wants to chat with you"}
                </p>
              </div>
              <Button
                onClick={() => handleAccept(c.chat_id)}
                className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium"
              >
                Accept
              </Button>
              <Button
                onClick={() => handleDecline(c.chat_id)}
                variant="secondary" size="icon" className="rounded-full"
                aria-label="Decline"
              >
                <X className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      </div>
      {showNew && <NewChatModal userId={userId} onClose={() => setShowNew(false)} onCreated={(id) => navigate({ to: "/chats/$chatId", params: { chatId: id } })} />}
    </div>
  );
}

function ChatRow({ chat, active, onOpen }: { chat: ChatSummary; active: boolean; onOpen: () => void }) {
  const title = chat.is_group ? chat.name ?? "Group chat" : chat.other_members[0]?.display_name ?? "Chat";
  const avatarName = chat.is_group ? title : chat.other_members[0]?.display_name ?? "?";
  const avatarPath = chat.is_group ? null : chat.other_members[0]?.avatar_url;
  return (
    <Button onClick={onOpen} variant="ghost" className={`w-full h-auto justify-start gap-3 p-3 rounded-lg text-left ${active ? "bg-secondary" : ""}`}>
      {chat.is_group ? (
        <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center">
          <Users className="w-5 h-5" />
        </div>
      ) : (
        <Avatar displayName={avatarName} avatarPath={avatarPath} size={44} />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{title}</p>
        <p className="text-sm text-muted-foreground truncate">
          {chat.last_message?.body ?? "Request sent"}
        </p>
      </div>
    </Button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="text-center py-16">
      <img src={logo} alt="" className="w-20 h-20 mx-auto opacity-70" width={512} height={512} />
      <p className="mt-4 text-muted-foreground">No chats yet. Send a request to start one.</p>
      <Button onClick={onNew} className="mt-4 rounded-full bg-primary text-primary-foreground px-5 py-2.5 font-medium">
        New chat
      </Button>
    </div>
  );
}

function NewChatModal({ userId, onClose, onCreated }: { userId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<ProfileLite[]>([]);
  const [busy, setBusy] = useState(false);

  function pick(p: ProfileLite) {
    if (mode === "dm") setSelected([p]);
    else if (!selected.find((m) => m.id === p.id)) setSelected([...selected, p]);
  }

  async function submit() {
    setBusy(true);
    try {
      if (mode === "dm") {
        if (selected.length === 0) return toast.error("Pick someone to chat with");
        const id = await createDMChat(userId, selected[0].id);
        toast.success("Request sent");
        onCreated(id);
      } else {
        if (!groupName.trim()) return toast.error("Group name required");
        if (selected.length === 0) return toast.error("Add at least one member");
        const id = await createGroupChat(userId, groupName.trim(), selected.map((m) => m.id));
        toast.success("Group created — invites sent");
        onCreated(id);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-foreground/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-3xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">New chat</h2>
          <Button variant="ghost" size="icon" aria-label="Close new chat" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>
        <div className="flex gap-2 mb-4">
          <Button variant="secondary" onClick={() => { setMode("dm"); setSelected([]); }} className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === "dm" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Direct</Button>
          <Button variant="secondary" onClick={() => { setMode("group"); setSelected([]); }} className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === "group" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Group</Button>
        </div>
        {mode === "group" && (
          <input
            className="w-full rounded-xl bg-input px-4 py-3 mb-3"
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        )}
        <UserSearch
          placeholder="Search people by username"
          excludeIds={selected.map((s) => s.id)}
          onSelect={pick}
        />
        {selected.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {selected.map((m) => (
              <li key={m.id} className="flex items-center gap-2 bg-secondary rounded-full pl-1 pr-3 py-1 text-sm">
                <Avatar displayName={m.display_name} avatarPath={m.avatar_url} size={22} />
                <span>@{m.username}</span>
                <Button variant="ghost" size="icon" onClick={() => setSelected(selected.filter((x) => x.id !== m.id))} aria-label="Remove">
                  <X className="w-3 h-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          onClick={submit}
          disabled={busy}
          className="mt-5 w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-60"
        >
          {mode === "dm" ? "Send request" : "Create group"}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground text-center">
          {mode === "dm" ? "They'll need to accept before you can chat." : "Members must accept the invite to see messages."}
        </p>
      </div>
    </div>
  );
}
