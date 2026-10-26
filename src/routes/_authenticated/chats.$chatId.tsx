import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { bubbleClasses, BUBBLE_COLORS, CHAT_BACKGROUNDS, type BubbleColor, type PresetId } from "@/lib/chat-presets";
import { resolveStorageUrl, uploadFile } from "@/lib/storage";
import { ArrowLeft, Check, CheckCheck, Image as ImageIcon, Info, Palette, Send, Settings, Users, X, UserRound, ChevronRight, Phone, Video, Paperclip, Loader2 } from "lucide-react";
import type { ProfileLite } from "@/lib/chats";
import { UserSearch } from "@/components/UserSearch";
import { Button } from "@/components/ui/button";
import { useCalls } from "@/components/CallProvider";
import { MessageImage } from "@/components/MessageImage";
import { canCall, imageExtension } from "@/lib/call-rules";

export const Route = createFileRoute("/_authenticated/chats/$chatId")({
  component: ChatThread,
  head: () => ({ meta: [
    { title: "Conversation · SnootChat" },
    { name: "description", content: "Chat with friends and personalize your SnootChat conversation." },
    { property: "og:title", content: "Conversation · SnootChat" },
    { property: "og:description", content: "Chat with friends and personalize your SnootChat conversation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type Chat = {
  id: string;
  is_group: boolean;
  name: string | null;
  background_type: string;
  background_value: string;
  created_by: string;
};
type Member = {
  chat_id: string;
  user_id: string;
  status: "pending" | "accepted" | "declined";
  bubble_color: BubbleColor;
  role: "member" | "owner";
  profile: { id: string; username: string; display_name: string; avatar_url: string | null };
};
type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  delivered_at: string | null;
  attachment_path: string | null;
};

function ChatThread() {
  const { chatId } = Route.useParams();
  const { userId } = Route.useRouteContext();
  const navigate = useNavigate();
  const { startCall, busy: callBusy } = useCalls();
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [chat, setChat] = useState<Chat | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [showBg, setShowBg] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  useEffect(() => { setShowDetails(window.matchMedia("(min-width: 1100px)").matches); }, []);
  const scrollRef = useRef<HTMLDivElement>(null);

  const myMembership = members.find((m) => m.user_id === userId);
  const others = members.filter((m) => m.user_id !== userId);
  const otherAccepted = others.filter((m) => m.status === "accepted");

  async function loadAll(showSpinner = false) {
    if (showSpinner) setLoading(true);
    setLoadError(null);
    try {
      const [{ data: c, error: chatError }, { data: memberRows, error: membersError }] = await Promise.all([
      supabase.from("chats").select("*").eq("id", chatId).single(),
      supabase
        .from("chat_members")
        .select("chat_id, user_id, status, bubble_color, role")
        .eq("chat_id", chatId),
      ]);
      if (chatError) throw chatError;
      if (membersError) throw membersError;
      if (!c) throw new Error("Chat not found");

      const profileIds = Array.from(new Set((memberRows ?? []).map((row) => row.user_id)));
      const { data: profiles, error: profilesError } = profileIds.length
        ? await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .in("id", profileIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      setMembers(
        (memberRows ?? []).map((row) => {
          const profile = profileById.get(row.user_id);
          return {
          chat_id: row.chat_id,
          user_id: row.user_id,
          status: row.status as Member["status"],
          bubble_color: row.bubble_color as BubbleColor,
          role: row.role as Member["role"],
            profile: {
              id: row.user_id,
              username: profile?.username ?? "unknown",
              display_name: profile?.display_name ?? "Snoot user",
              avatar_url: profile?.avatar_url ?? null,
            },
          };
        }),
      );
      setChat(c as Chat);

      const currentMember = (memberRows ?? []).find((row) => row.user_id === userId);
      if (currentMember?.status === "accepted") {
        const { data: msgs, error: messagesError } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: true });
        if (messagesError) throw messagesError;
        setMessages((msgs ?? []) as Message[]);
      } else {
        setMessages([]);
      }
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setChat(null);
    setMembers([]);
    setMessages([]);
    loadAll(true);
    const ch = supabase
      .channel(`chat-${chatId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          // Mark delivered if it's incoming
          if (msg.sender_id !== userId && !msg.delivered_at) {
            supabase.from("messages").update({ delivered_at: new Date().toISOString() }).eq("id", msg.id);
          }
        } else if (payload.eventType === "UPDATE") {
          const msg = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_members", filter: `chat_id=eq.${chatId}` }, () => loadAll())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chats", filter: `id=eq.${chatId}` }, (payload) => setChat(payload.new as Chat))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, userId]);

  // Mark delivered on load
  useEffect(() => {
    const undelivered = messages.filter((m) => m.sender_id !== userId && !m.delivered_at);
    if (undelivered.length > 0) {
      supabase
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .in("id", undelivered.map((m) => m.id));
    }
  }, [messages, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Resolve custom background URL
  useEffect(() => {
    if (!chat) return;
    if (chat.background_type === "custom") {
      resolveStorageUrl(chat.background_value, "chat-backgrounds").then(setCustomBgUrl);
    } else {
      setCustomBgUrl(null);
    }
  }, [chat]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || !myMembership || myMembership.status !== "accepted") return;
    setInput("");
    const { error } = await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: userId,
      body: text,
    });
    if (error) {
      toast.error(error.message);
      setInput(text);
    }
  }

  async function sendAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploading || !canCall(myMembership?.status)) return;
    const extension = imageExtension(file.type);
    if (!extension) { toast.error("Choose a PNG, JPEG, GIF, or WebP image."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Choose an image smaller than 10 MB."); return; }
    const path = `${chatId}/${userId}/${crypto.randomUUID()}.${extension}`;
    setUploading(true);
    try {
      const { error: uploadError } = await supabase.storage.from("chat-images").upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data, error } = await supabase.from("messages").insert({ chat_id: chatId, sender_id: userId, body: "", attachment_path: path }).select().single();
      if (error) { await supabase.storage.from("chat-images").remove([path]); throw error; }
      if (data) setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data as Message]);
    } catch (error) { toast.error((error as Error).message); }
    finally { setUploading(false); }
  }

  async function setBubbleColor(color: BubbleColor) {
    const { error } = await supabase
      .from("chat_members")
      .update({ bubble_color: color })
      .eq("chat_id", chatId)
      .eq("user_id", userId);
    if (error) toast.error(error.message);
    else setShowBubble(false);
  }

  async function setPresetBackground(preset: PresetId) {
    const { error } = await supabase
      .from("chats")
      .update({ background_type: "preset", background_value: preset })
      .eq("id", chatId);
    if (error) toast.error(error.message);
    else setShowBg(false);
  }

  async function uploadBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `${chatId}/${Date.now()}-${file.name}`;
    try {
      await uploadFile("chat-backgrounds", path, file);
      const { error } = await supabase
        .from("chats")
        .update({ background_type: "custom", background_value: path })
        .eq("id", chatId);
      if (error) throw error;
      setShowBg(false);
      toast.success("Background updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function addMember(p: ProfileLite): Promise<void> {
    if (members.find((m) => m.user_id === p.id)) { toast.error("Already a member"); return; }
    const { error } = await supabase.from("chat_members").insert({
      chat_id: chatId,
      user_id: p.id,
      status: "pending",
      invited_by: userId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Invite sent");
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (loadError || !chat || !myMembership) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">Unable to open this chat.</p>
        {loadError && <p className="max-w-md text-sm text-muted-foreground">{loadError}</p>}
        <div className="flex gap-2">
          <Button onClick={() => navigate({ to: "/chats" })} className="rounded-full bg-secondary px-4 py-2 text-sm font-medium">
            Back to chats
          </Button>
          <Button onClick={() => loadAll(true)} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const bgPresetClass =
    chat.background_type === "preset"
      ? CHAT_BACKGROUNDS.find((b) => b.id === chat.background_value)?.className ?? "bg-preset-midnight"
      : "";

  const title = chat.is_group
    ? chat.name ?? "Group chat"
    : others[0]?.profile.display_name ?? "Chat";

  return (
    <div className="h-full flex relative">
    <div className="min-w-0 flex-1 flex flex-col h-full">
      <header className="flex flex-wrap items-center gap-2 px-3 py-3 border-b border-border bg-background shrink-0 z-10">
        <Button variant="ghost" size="icon" aria-label="Back to chats" onClick={() => navigate({ to: "/chats" })} className="rounded-full md:hidden">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        {chat.is_group ? (
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"><Users className="w-5 h-5" /></div>
        ) : others[0] ? (
          <Link to="/u/$username" params={{ username: others[0].profile.username }}>
            <Avatar displayName={title} avatarPath={others[0].profile.avatar_url} size={40} />
          </Link>
        ) : (
          <Avatar displayName={title} size={40} />
        )}
        <div className="flex-1 min-w-16">
          <p className="font-semibold truncate">{title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {chat.is_group
              ? `${otherAccepted.length + 1} members${others.some((o) => o.status === "pending") ? " · some pending" : ""}`
              : others[0]?.status === "pending"
                ? "Waiting for them to accept…"
                : `@${others[0]?.profile.username ?? ""}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full text-primary" aria-label="Voice call" title="Voice call" disabled={!canCall(myMembership.status) || callBusy} onClick={() => void startCall(chatId, "voice")}><Phone className="size-5" /></Button>
        <Button variant="ghost" size="icon" className="rounded-full text-primary" aria-label="Video call" title="Video call" disabled={!canCall(myMembership.status) || callBusy} onClick={() => void startCall(chatId, "video")}><Video className="size-5" /></Button>
        <Button variant="ghost" size="icon" title="Chat customization" onClick={() => setShowBubble(true)} className="hidden sm:inline-flex p-2 rounded-full hover:bg-secondary" aria-label="Bubble color">
          <Palette className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" title="Chat customization" onClick={() => setShowBg(true)} className="hidden sm:inline-flex p-2 rounded-full hover:bg-secondary" aria-label="Background">
          <ImageIcon className="w-5 h-5" />
        </Button>
        {chat.is_group && (
          <Button variant="ghost" size="icon" title="Chat customization" onClick={() => setShowMembers(true)} className="p-2 rounded-full hover:bg-secondary" aria-label="Members">
            <Settings className="w-5 h-5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="rounded-full text-primary" aria-label="Chat details" title="Chat details" onClick={() => setShowDetails(!showDetails)}><Info /></Button>
      </header>

      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto px-4 py-6 ${bgPresetClass}`}
        style={
          chat.background_type === "custom" && customBgUrl
            ? { backgroundImage: `url(${customBgUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          {myMembership.status !== "accepted" && (
            <div className="bg-card/90 backdrop-blur rounded-2xl p-4 text-center text-sm">
              You need to accept the invite to see messages.
            </div>
          )}
          {messages.map((m) => {
            const mine = m.sender_id === userId;
            const sender = members.find((x) => x.user_id === m.sender_id);
            const color: BubbleColor = mine ? myMembership.bubble_color : "blue"; // gray for others
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[75%] flex flex-col gap-0.5">
                  {chat.is_group && !mine && sender && (
                    <span className="text-[11px] text-foreground bg-background/80 rounded-full px-2 self-start">{sender.profile.display_name}</span>
                  )}
                  {m.attachment_path && <MessageImage path={m.attachment_path} />}
                  {m.body && <div
                    className={`px-4 py-2 rounded-2xl whitespace-pre-wrap [overflow-wrap:anywhere] ${
                      mine
                        ? bubbleClasses(color)
                        : "bg-bubble-gray text-bubble-gray-foreground"
                    }`}
                  >
                    {m.body}
                  </div>}
                  {mine && (
                    <span className="self-end text-[10px] text-muted-foreground bg-background/80 rounded-full px-1.5 flex items-center gap-0.5">
                      {m.delivered_at ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                      {m.delivered_at ? "Delivered" : "Sent"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border p-3 bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="max-w-2xl mx-auto flex gap-2 items-end"
        >
          <input ref={attachmentInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={sendAttachment} aria-label="Choose image or GIF" />
          <Button type="button" variant="ghost" size="icon" className="rounded-full text-primary size-11 shrink-0" aria-label="Attach image or GIF" title="Attach image or GIF" disabled={uploading || myMembership.status !== "accepted"} onClick={() => attachmentInput.current?.click()}>{uploading ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}</Button>
          <textarea
            aria-label="Message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={myMembership.status === "accepted" ? "Message…" : "Accept the invite to send messages"}
            disabled={myMembership.status !== "accepted"}
            rows={1}
            className="flex-1 min-w-0 resize-none rounded-full bg-input px-4 py-2.5 outline-none focus:ring-2 focus:ring-ring max-h-32 disabled:opacity-60"
          />
          <Button
            type="submit"
            disabled={!input.trim() || myMembership.status !== "accepted"}
            variant="ghost" size="icon" className="rounded-full text-primary size-11 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>

    </div>
    {showDetails && <aside aria-label="Chat details panel" className="absolute inset-0 z-20 bg-background lg:static lg:w-64 xl:w-72 shrink-0 border-l border-border overflow-y-auto p-5">
      <div className="flex justify-end"><Button variant="ghost" size="icon" aria-label="Close chat details" onClick={() => setShowDetails(false)}><X /></Button></div>
      <div className="flex flex-col items-center text-center pt-4 pb-8">
        {chat.is_group ? <div className="size-20 rounded-full bg-secondary flex items-center justify-center"><Users className="size-9" /></div> : <Avatar displayName={title} avatarPath={others[0]?.profile.avatar_url} size={80} />}
        <h2 className="font-bold mt-4 break-words w-full">{title}</h2>
        {!chat.is_group && <p className="text-sm text-muted-foreground break-all">@{others[0]?.profile.username}</p>}
        {!chat.is_group && others[0] && <Button asChild variant="secondary" size="icon" className="rounded-full mt-4"><Link to="/u/$username" params={{ username: others[0].profile.username }} title="View profile" aria-label="View profile"><UserRound /></Link></Button>}
      </div>
      <h3 className="text-sm font-semibold mb-3">Customize chat</h3>
      <Button variant="ghost" onClick={() => setShowBubble(true)} className="w-full justify-start h-12"><Palette /> Bubble color <ChevronRight className="ml-auto" /></Button>
      <Button variant="ghost" onClick={() => setShowBg(true)} className="w-full justify-start h-12"><ImageIcon /> Background <ChevronRight className="ml-auto" /></Button>
      {chat.is_group && <Button variant="ghost" onClick={() => setShowMembers(true)} className="w-full justify-start h-12"><Users /> Members <ChevronRight className="ml-auto" /></Button>}
    </aside>}

      {showBubble && (
        <Sheet onClose={() => setShowBubble(false)} title="Your bubble color">
          <div className="grid grid-cols-4 gap-3 mt-4">
            {BUBBLE_COLORS.map((c) => (
              <Button variant="ghost"
                key={c}
                onClick={() => setBubbleColor(c)}
                className={`h-auto aspect-square rounded-lg ${bubbleClasses(c)} flex items-end p-2 text-xs font-medium capitalize ${myMembership.bubble_color === c ? "ring-2 ring-primary" : ""}`}
              >
                {c}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Only your sent messages use this color. Each person picks their own.</p>
        </Sheet>
      )}

      {showBg && (
        <Sheet onClose={() => setShowBg(false)} title="Chat background">
          <div className="grid grid-cols-4 gap-3 mt-4">
            {CHAT_BACKGROUNDS.map((b) => (
              <Button variant="ghost"
                key={b.id}
                onClick={() => setPresetBackground(b.id)}
                className={`h-auto aspect-square rounded-lg ${b.className} flex items-end p-2 text-xs font-medium text-foreground [&>span]:bg-background/80 ${chat.background_type === "preset" && chat.background_value === b.id ? "ring-2 ring-primary" : ""}`}
              >
                <span className="rounded-full px-2 py-0.5">{b.name}</span>
              </Button>
            ))}
          </div>
          <label className="mt-4 block cursor-pointer rounded-2xl border border-dashed border-border p-4 text-center hover:bg-secondary">
            <ImageIcon className="w-5 h-5 mx-auto mb-1" />
            <span className="text-sm">Upload custom background</span>
            <input type="file" accept="image/*" className="hidden" onChange={uploadBackground} />
          </label>
          <p className="mt-2 text-xs text-muted-foreground text-center">Everyone in the chat sees the same background.</p>
        </Sheet>
      )}

      {showMembers && (
        <Sheet onClose={() => setShowMembers(false)} title="Members">
          <ul className="mt-4 space-y-2">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 p-2">
                <Link
                  to="/u/$username"
                  params={{ username: m.profile.username }}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <Avatar displayName={m.profile.display_name} avatarPath={m.profile.avatar_url} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.profile.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">@{m.profile.username} · {m.status}</p>
                  </div>
                </Link>
                {m.role === "owner" && <span className="text-[10px] uppercase text-primary">Owner</span>}
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <UserSearch
              placeholder="Add someone by username"
              excludeIds={members.map((m) => m.user_id)}
              onSelect={(p) => addMember(p)}
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 bg-foreground/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-3xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>
        {children}
      </div>
    </div>
  );
}

