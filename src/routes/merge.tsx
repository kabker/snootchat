import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { confirmAccountMerge, getAccountMerge } from "@/lib/merge.functions";

export const Route = createFileRoute("/merge")({
  validateSearch: z.object({ r: z.string().optional() }),
  head: () => ({ meta: [
    { title: "Merge accounts · SnootChat" },
    { name: "description", content: "Confirm merging two SnootChat accounts into one." },
    { property: "og:title", content: "Merge accounts · SnootChat" },
    { property: "og:description", content: "Confirm merging two SnootChat accounts into one." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MergePage,
});

type P = { id: string; username: string; display_name: string; avatar_url: string | null } | null;

function MergePage() {
  const { r } = Route.useSearch();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ requester: P; me: P } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keep, setKeep] = useState<"requester" | "me" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!r) { setError("This merge link is incomplete."); return; }
    let done = false;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || done) return;
      done = true;
      try { setInfo(await getAccountMerge({ data: { id: r } })); }
      catch (e) { setError((e as Error).message); }
    };
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => void load());
    const t = setTimeout(() => { if (!done) setError("Open the link from your email to confirm the merge."); }, 6000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [r]);

  async function confirm() {
    if (!keep || !r) return;
    setBusy(true);
    try {
      const res = await confirmAccountMerge({ data: { id: r, keep } });
      if (res.keptMe) {
        toast.success("Accounts merged");
        navigate({ to: "/chats", replace: true });
      } else {
        await supabase.auth.signOut();
        toast.success("Accounts merged — sign in to the account you kept");
        navigate({ to: "/auth", replace: true });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  const option = (key: "requester" | "me", p: P) => p && (
    <button type="button" onClick={() => setKeep(key)}
      className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left ${keep === key ? "border-primary bg-accent" : "border-border"}`}>
      <Avatar displayName={p.display_name} avatarPath={p.avatar_url} size={44} />
      <div><p className="font-medium">{p.display_name}</p><p className="text-sm text-muted-foreground">@{p.username}</p></div>
    </button>
  );

  return <div className="min-h-screen flex items-center justify-center px-5">
    <div className="w-full max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Merge accounts</h1>
      {error ? <p className="text-muted-foreground">{error}</p> : !info ? <p className="text-muted-foreground">Loading…</p> : <>
        <p className="text-sm text-muted-foreground">Choose the account that keeps everything. All chats, messages and groups from the other account move into it, and the other account is deleted.</p>
        {option("requester", info.requester)}
        {option("me", info.me)}
        <Button className="w-full rounded-full" disabled={!keep || busy} onClick={confirm}>{busy ? "Merging…" : "Merge accounts"}</Button>
      </>}
    </div>
  </div>;
}
