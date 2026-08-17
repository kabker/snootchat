import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyChats, createDMChat, createGroupChat, type ChatSummary, type ProfileLite } from "@/lib/chats";
import { UserSearch } from "@/components/UserSearch";
import { Avatar } from "@/components/Avatar";
import logo from "@/assets/snoot-logo.png";
import { Settings as SettingsIcon, Plus, Users, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chats/")({
  component: ChatsList,
});

function ChatsList() {
  const { userId } = Route.useRouteContext();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"chats" | "requests">("chats");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

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

  const accepted = chats.filter((c) => c.status === "accepted");
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
    <div className="min-h-screen max-w-2xl mx-auto px-4 pb-24">
      <header className="flex items-center justify-between py-4 sticky top-0 bg-background z-10 border-b border-border">
        <div className="flex items-center gap-2">
          <img src={logo} alt="" className="w-9 h-9" width={512} height={512} />
          <div>
            <h1 className="text-lg font-bold leading-none">SnootChat</h1>
            <p className="text-[11px] text-muted-foreground">chat cozy</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNew(true)}
            className="rounded-full bg-primary text-primary-foreground p-2 hover:opacity-90"
            aria-label="New chat"
          >
            <Plus className="w-5 h-5" />
          </button>
          <Link
            to="/settings"
            className="rounded-full border border-border p-2 hover:bg-secondary"
            aria-label="Settings"
          >
            <SettingsIcon className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <div className="flex gap-2 my-4">
        <button
          onClick={() => setTab("chats")}
          className={`flex-1 py-2 rounded-full text-sm font-medium ${tab === "chats" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
        >
          Chats {accepted.length > 0 && `(${accepted.length})`}
        </button>
        <button
          onClick={() => setTab("requests")}
          className={`flex-1 py-2 rounded-full text-sm font-medium ${tab === "requests" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
        >
          Requests {pending.length > 0 && `(${pending.length})`}
        </button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-10">Loading…</p>
      ) : tab === "chats" ? (
        accepted.length === 0 ? (
          <EmptyState onNew={() => setShowNew(true)} />
        ) : (
          <ul className="space-y-1">
            {accepted.map((c) => (
              <li key={c.chat_id}>
                <ChatRow chat={c} onOpen={() => navigate({ to: "/chats/$chatId", params: { chatId: c.chat_id } })} />
              </li>
            ))}
          </ul>
        )
      ) : pending.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">No pending requests.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((c) => (
            <li key={c.chat_id} className="rounded-2xl bg-card border border-border p-3 flex items-center gap-3">
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
              <button
                onClick={() => handleAccept(c.chat_id)}
                className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium"
              >
                Accept
              </button>
              <button
                onClick={() => handleDecline(c.chat_id)}
                className="rounded-full border border-border p-2"
                aria-label="Decline"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showNew && <NewChatModal userId={userId} onClose={() => setShowNew(false)} onCreated={(id) => navigate({ to: "/chats/$chatId", params: { chatId: id } })} />}
    </div>
  );
}

function ChatRow({ chat, onOpen }: { chat: ChatSummary; onOpen: () => void }) {
  const title = chat.is_group ? chat.name ?? "Group chat" : chat.other_members[0]?.display_name ?? "Chat";
  const avatarName = chat.is_group ? title : chat.other_members[0]?.display_name ?? "?";
  const avatarPath = chat.is_group ? null : chat.other_members[0]?.avatar_url;
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-card text-left">
      {chat.is_group ? (
        <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center">
          <Users className="w-5 h-5" />
        </div>
      ) : (
        <Avatar displayName={avatarName} avatarPath={avatarPath} size={44} />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{title}</p>
        <p className="text-sm text-muted-foreground truncate">
          {chat.last_message?.body ?? "Say hi!"}
        </p>
      </div>
    </button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="text-center py-16">
      <img src={logo} alt="" className="w-20 h-20 mx-auto opacity-70" width={512} height={512} />
      <p className="mt-4 text-muted-foreground">No chats yet. Send a request to start one.</p>
      <button onClick={onNew} className="mt-4 rounded-full bg-primary text-primary-foreground px-5 py-2.5 font-medium">
        New chat
      </button>
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-3xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">New chat</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => { setMode("dm"); setSelected([]); }} className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === "dm" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Direct</button>
          <button onClick={() => { setMode("group"); setSelected([]); }} className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === "group" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Group</button>
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
                <button onClick={() => setSelected(selected.filter((x) => x.id !== m.id))} aria-label="Remove">
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={submit}
          disabled={busy}
          className="mt-5 w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-60"
        >
          {mode === "dm" ? "Send request" : "Create group"}
        </button>
        <p className="mt-3 text-xs text-muted-foreground text-center">
          {mode === "dm" ? "They'll need to accept before you can chat." : "Members must accept the invite to see messages."}
        </p>
      </div>
    </div>
  );
}
