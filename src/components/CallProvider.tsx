import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type Peer from "simple-peer";
import { supabase } from "@/integrations/supabase/client";
import { fallbackConstraints, mediaConstraints, MIC_GAIN, type CallKind } from "@/lib/call-rules";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Call = { id: string; chat_id: string; caller_id: string; kind: CallKind; status: string; expires_at: string; created_at: string };
type Tile = { id: string; name: string; stream: MediaStream | null; connected: boolean };
type Active = { call: Call; title: string; stream: MediaStream };
const CallContext = createContext<{ startCall: (chatId: string, kind: CallKind) => Promise<void>; busy: boolean }>({ startCall: async () => {}, busy: false });
export const useCalls = () => useContext(CallContext);

// Remote audio plays through its own always-mounted element so re-renders and hidden video never interrupt it.
function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

function MediaTile({ stream, name, local, kind, connected }: { stream: MediaStream | null; name: string; local?: boolean; kind: CallKind; connected: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!video.current) return;
    if (video.current.srcObject !== stream) video.current.srcObject = stream;
    void video.current.play().catch(() => {});
  }, [stream]);
  return <div className="relative aspect-video min-w-0 rounded-lg bg-secondary overflow-hidden flex flex-col items-center justify-center gap-3">
    <video ref={video} autoPlay playsInline muted className={kind === "video" && stream ? "absolute inset-0 w-full h-full object-cover" : "hidden"} />
    {(!stream || kind === "voice") && <><Avatar displayName={name} size={64} /><p className="max-w-full px-3 truncate text-sm">{connected ? name : "Connecting…"}</p></>}
    <span className="absolute bottom-2 left-2 max-w-[90%] truncate rounded-md bg-background/90 px-2 py-1 text-xs">{name}{local ? " (You)" : ""}</span>
  </div>;
}

async function getMedia(kind: CallKind): Promise<MediaStream> {
  let raw: MediaStream | null = null; let lastError: unknown;
  for (const c of [mediaConstraints(kind), ...fallbackConstraints(kind)]) {
    try { raw = await navigator.mediaDevices.getUserMedia(c); break; }
    catch (e) { lastError = e; if ((e as DOMException)?.name === "NotAllowedError") throw e; }
  }
  if (!raw) throw lastError;
  // Lower microphone sensitivity by sending the mic through a quiet gain stage.
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(raw);
    const gain = ctx.createGain(); gain.gain.value = MIC_GAIN;
    const dest = ctx.createMediaStreamDestination();
    src.connect(gain).connect(dest);
    const [processed] = dest.stream.getAudioTracks();
    const out = new MediaStream([processed, ...raw.getVideoTracks()]);
    const originals = raw.getTracks();
    processed.stop = ((stop) => () => { stop.call(processed); originals.forEach(t => t.stop()); void ctx.close(); })(processed.stop);
    processed.addEventListener("ended", () => originals.forEach(t => t.stop()));
    // Keep mute toggling working on the real mic too.
    Object.defineProperty(processed, "enabled", { get: () => originals.find(t => t.kind === "audio")?.enabled ?? true, set: (v: boolean) => originals.filter(t => t.kind === "audio").forEach(t => { t.enabled = v; }) });
    return out;
  } catch { return raw; }
}

// Simple generated ringtone so no audio file is needed.
function useRingtone(on: boolean, outgoing: boolean) {
  useEffect(() => {
    if (!on) return;
    let ctx: AudioContext | null = null;
    try { ctx = new AudioContext(); } catch { return; }
    const c = ctx;
    const ring = () => {
      if (c.state === "suspended") void c.resume().catch(() => {});
      const t = c.currentTime;
      const pattern = outgoing ? [[0, 1.2]] : [[0, 0.4], [0.6, 0.4]];
      for (const [start, len] of pattern) for (const f of outgoing ? [440, 480] : [660, 880]) {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = f; g.gain.setValueAtTime(0, t + start); g.gain.linearRampToValueAtTime(0.08, t + start + 0.03); g.gain.setValueAtTime(0.08, t + start + len - 0.05); g.gain.linearRampToValueAtTime(0, t + start + len);
        o.connect(g).connect(c.destination); o.start(t + start); o.stop(t + start + len);
      }
    };
    ring();
    const timer = setInterval(ring, outgoing ? 3000 : 2000);
    return () => { clearInterval(timer); void c.close().catch(() => {}); };
  }, [on, outgoing]);
}

export function CallProvider({ children, userId }: { children: ReactNode; userId: string | null }) {
  const [active, setActive] = useState<Active | null>(null);
  const activeRef = useRef<Active | null>(null);
  const [incoming, setIncoming] = useState<Call | null>(null);
  const [incomingTitle, setIncomingTitle] = useState("Incoming call");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dismissed = useRef(new Set<string>());
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const peers = useRef(new Map<string, Peer.Instance>());
  const seenSignals = useRef(new Set<string>());
  const generation = useRef(0);
  useRingtone(!!incoming && !active, false);
  useRingtone(!!active && tiles.every(t => !t.connected), true);

  async function titleFor(call: Call) {
    const { data: chat } = await supabase.from("chats").select("name,is_group").eq("id", call.chat_id).single();
    if (chat?.is_group) return chat.name || "Group call";
    const { data: member } = await supabase.from("chat_members").select("user_id").eq("chat_id", call.chat_id).neq("user_id", userId ?? "").limit(1).maybeSingle();
    if (!member) return "Call";
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", member.user_id).maybeSingle();
    return profile?.display_name || "Call";
  }

  function release() {
    generation.current++;
    peers.current.forEach(peer => peer.destroy()); peers.current.clear();
    activeRef.current?.stream.getTracks().forEach(track => track.stop());
    activeRef.current = null; setActive(null); setTiles([]); setMuted(false); setCameraOff(false); setElapsed(0);
  }

  async function leave() {
    const current = activeRef.current;
    if (!current || !userId) return;
    dismissed.current.add(current.call.id);
    release();
    await supabase.from("call_participants").update({ state: "left" }).eq("call_id", current.call.id).eq("user_id", userId);
  }

  async function join(call: Call) {
    if (!userId || activeRef.current || pending.current) return;
    pending.current = true; setBusy(true);
    let stream: MediaStream | null = null;
    const version = generation.current;
    try {
      await import("webrtc-adapter").catch(() => {});
      stream = await getMedia(call.kind);
      if (version !== generation.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const { error } = await supabase.from("call_participants").upsert({ call_id: call.id, user_id: userId, state: "joined" });
      if (error) throw error;
      const title = await titleFor(call);
      const value = { call, title, stream };
      activeRef.current = value; setActive(value); setIncoming(null); seenSignals.current.clear();
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      const name = (error as DOMException)?.name;
      toast.error(name === "NotAllowedError" || name === "SecurityError" ? "Allow microphone and camera access to join the call."
        : name === "NotReadableError" ? "Your microphone or camera is being used by another app. Close it and try again."
        : name === "NotFoundError" ? "No microphone was found on this device."
        : (error as Error).message || "Could not start the call.");
    } finally { pending.current = false; setBusy(false); }
  }

  async function startCall(chatId: string, kind: CallKind) {
    if (activeRef.current || pending.current || !userId) return;
    setBusy(true);
    try {
      const { data: id, error } = await supabase.rpc("start_chat_call", { target_chat_id: chatId, call_kind: kind });
      if (error) throw error;
      const { data: call, error: readError } = await supabase.from("chat_calls").select("*").eq("id", id).single();
      if (readError) throw readError;
      if (call) await join(call as Call);
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!userId) return;
    let live = true;
    async function checkCalls() {
      const { data } = await supabase.from("chat_calls").select("*").eq("status", "active").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
      if (!live) return;
      const call = data?.find(c => c.caller_id !== userId && !dismissed.current.has(c.id) && Date.now() - Date.parse(c.created_at) < 90000);
      if (activeRef.current || !call) { setIncoming(null); return; }
      setIncoming(call as Call);
      const title = await titleFor(call as Call); if (live) setIncomingTitle(title);
    }
    void checkCalls();
    const channel = supabase.channel(`incoming-calls-${userId}-${Math.random()}`).on("postgres_changes", { event: "*", schema: "public", table: "chat_calls" }, () => void checkCalls()).subscribe();
    const timer = setInterval(checkCalls, 5000);
    return () => { live = false; clearInterval(timer); void supabase.removeChannel(channel); const current = activeRef.current; release(); if (current) void supabase.from("call_participants").update({ state: "left" }).eq("call_id", current.call.id).eq("user_id", userId); };
  }, [userId]);

  useEffect(() => {
    if (!active || !userId) return;
    const currentUserId = userId;
    let live = true, syncing = false;
    const version = generation.current;
    const callId = active.call.id;
    async function sync() {
      if (!live || syncing) return;
      syncing = true;
      try {
        const [{ data: participants, error }, { data: call }] = await Promise.all([
          supabase.from("call_participants").select("*").eq("call_id", callId).eq("state", "joined").gt("updated_at", new Date(Date.now() - 90000).toISOString()),
          supabase.from("chat_calls").select("status").eq("id", callId).single(),
        ]);
        if (!live) return;
        if (error) throw error;
        if (!call || call.status === "ended") { release(); toast("Call ended"); return; }
        const remote = (participants ?? []).filter(p => p.user_id !== userId);
        for (const [id, peer] of peers.current) if (!remote.some(p => p.user_id === id)) { peer.destroy(); peers.current.delete(id); setTiles(prev => prev.filter(t => t.id !== id)); }
        for (const participant of remote) {
          const id = participant.user_id;
          if (peers.current.has(id)) continue;
          const { default: PeerEngine } = await import("simple-peer/simplepeer.min.js");
          if (!live || version !== generation.current || !activeRef.current) return;
          const peer = new PeerEngine({ initiator: currentUserId.localeCompare(id) < 0, trickle: true, stream: activeRef.current.stream, config: { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }] } });
          peers.current.set(id, peer);
          setTiles(prev => [...prev.filter(t => t.id !== id), { id, name: "Participant", stream: null, connected: false }]);
          peer.on("signal", signal => { if (live) void supabase.from("call_signals").insert({ call_id: callId, sender_id: currentUserId, recipient_id: id, payload: JSON.parse(JSON.stringify(signal)) }).then(({ error }) => { if (error && live) toast.error("Call connection interrupted. Try calling again."); }); });
          peer.on("stream", stream => setTiles(prev => prev.map(t => t.id === id ? (t.stream === stream ? t : { ...t, stream, connected: true }) : t)));
          peer.on("connect", () => setTiles(prev => prev.map(t => t.id === id ? { ...t, connected: true } : t)));
          peer.on("error", () => { if (live) toast.error("Could not connect this participant. Try another network."); });
          peer.on("close", () => { if (live) setTiles(prev => prev.map(t => t.id === id ? { ...t, connected: false, stream: null } : t)); });
          const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", id).maybeSingle();
          if (live) setTiles(prev => prev.map(t => t.id === id ? { ...t, name: profile?.display_name || "Participant" } : t));
        }
        const { data: signals } = await supabase.from("call_signals").select("*").eq("call_id", callId).eq("recipient_id", currentUserId).order("created_at");
        for (const signal of signals ?? []) {
          if (!live || seenSignals.current.has(signal.id)) continue;
          const peer = peers.current.get(signal.sender_id);
          if (!peer || peer.destroyed) continue;
          seenSignals.current.add(signal.id);
          try { peer.signal(signal.payload as Peer.SignalData); } catch { toast.error("Call connection failed."); }
          void supabase.from("call_signals").delete().eq("id", signal.id);
        }
      } catch { if (live) toast.error("Unable to refresh the call. Check your connection."); }
      finally { syncing = false; }
    }
    void sync();
    const poll = setInterval(sync, 2000);
    const heartbeat = setInterval(() => { void supabase.from("call_participants").update({ state: "joined" }).eq("call_id", callId).eq("user_id", userId).then(({ error }) => { if (error && live) { release(); toast.error("Call ended. Please call again."); } }); }, 20000);
    const clock = setInterval(() => setElapsed(n => n + 1), 1000);
    const timeout = setTimeout(() => { if (live && peers.current.size === 0) { void leave(); toast("No answer"); } }, 60000);
    return () => { live = false; clearInterval(poll); clearInterval(heartbeat); clearInterval(clock); clearTimeout(timeout); };
  }, [active?.call.id, userId]);

  return <CallContext.Provider value={{ startCall, busy: busy || !!active }}>
    {children}
    {incoming && !active && <div role="dialog" aria-label="Incoming call" className="fixed z-50 inset-x-4 top-6 mx-auto max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg">
      <div className="flex items-center gap-3"><Avatar displayName={incomingTitle} size={48} /><div className="min-w-0"><p className="font-semibold truncate">{incomingTitle}</p><p className="text-sm text-muted-foreground">Incoming {incoming.kind} call</p></div></div>
      <div className="flex gap-3 mt-5"><Button variant="destructive" className="flex-1" onClick={() => { dismissed.current.add(incoming.id); setIncoming(null); }}><PhoneOff /> Decline</Button><Button className="flex-1" disabled={busy} onClick={() => void join(incoming)}>{incoming.kind === "video" ? <Video /> : <Phone />} Answer</Button></div>
    </div>}
    {active && <div role="dialog" aria-modal="true" aria-label={`${active.call.kind === "video" ? "Video" : "Voice"} call`} className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="px-5 py-4 border-b border-border flex items-center gap-3"><div className="min-w-0 flex-1"><h2 className="font-semibold truncate">{active.title}</h2><p className="text-sm text-muted-foreground">{tiles.length ? `${tiles.length + 1} participants · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : "Calling…"}</p></div>{!tiles.length && <Loader2 className="size-5 animate-spin text-primary" />}</header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex items-center justify-center"><div className={`grid grid-cols-1 ${tiles.length ? "sm:grid-cols-2 max-w-5xl" : "max-w-xl"} gap-4 w-full`}><MediaTile name="You" stream={active.stream} kind={cameraOff ? "voice" : active.call.kind} local connected />{tiles.map(t => <MediaTile key={t.id} {...t} kind={active.call.kind} />)}{tiles.map(t => <RemoteAudio key={`a-${t.id}`} stream={t.stream} />)}</div></div>
      <footer className="flex justify-center gap-4 p-5 border-t border-border pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Button variant={muted ? "destructive" : "secondary"} size="icon" className="rounded-full size-12" aria-label={muted ? "Unmute microphone" : "Mute microphone"} title={muted ? "Unmute microphone" : "Mute microphone"} onClick={() => { active.stream.getAudioTracks().forEach(t => { t.enabled = muted; }); setMuted(!muted); }}>{muted ? <MicOff /> : <Mic />}</Button>
        {active.call.kind === "video" && <Button variant="secondary" size="icon" className="rounded-full size-12" aria-label={cameraOff ? "Turn camera on" : "Turn camera off"} title={cameraOff ? "Turn camera on" : "Turn camera off"} onClick={() => { active.stream.getVideoTracks().forEach(t => { t.enabled = cameraOff; }); setCameraOff(!cameraOff); }}>{cameraOff ? <VideoOff /> : <Video />}</Button>}
        <Button variant="destructive" size="icon" className="rounded-full size-12" aria-label="Leave call" title="Leave call" onClick={() => void leave()}><PhoneOff /></Button>
      </footer>
    </div>}
  </CallContext.Provider>;
}