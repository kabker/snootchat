import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export const startAccountMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    const myEmail = String((context.claims as { email?: string }).email ?? "").toLowerCase();
    if (myEmail === data.email) throw new Error("That's the account you're signed in to.");
    const db = await admin();
    const { data: row, error } = await db
      .from("account_merge_requests")
      .insert({ requester_id: context.userId, target_email: data.email })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

async function loadRequest(id: string, email: string) {
  const db = await admin();
  const { data: req } = await db.from("account_merge_requests").select("*").eq("id", id).maybeSingle();
  if (!req || req.used_at || new Date(req.expires_at) < new Date() || req.target_email !== email) {
    throw new Error("This merge link is invalid or has expired.");
  }
  return { db, req };
}

export const getAccountMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const email = String((context.claims as { email?: string }).email ?? "").toLowerCase();
    const { db, req } = await loadRequest(data.id, email);
    if (req.requester_id === context.userId) throw new Error("Open this link while signed in to the other account.");
    const { data: profiles } = await db
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", [req.requester_id, context.userId]);
    const find = (id: string) => profiles?.find((p) => p.id === id) ?? null;
    return { requester: find(req.requester_id), me: find(context.userId) };
  });

export const confirmAccountMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), keep: z.enum(["requester", "me"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const email = String((context.claims as { email?: string }).email ?? "").toLowerCase();
    const { db, req } = await loadRequest(data.id, email);
    if (req.requester_id === context.userId) throw new Error("Open this link while signed in to the other account.");
    const target = data.keep === "me" ? context.userId : req.requester_id;
    const source = data.keep === "me" ? req.requester_id : context.userId;
    await db.from("account_merge_requests").update({ used_at: new Date().toISOString() }).eq("id", req.id);
    const { error } = await db.rpc("merge_accounts", { _source: source, _target: target });
    if (error) throw new Error(error.message);
    const { error: delErr } = await db.auth.admin.deleteUser(source);
    if (delErr) throw new Error(delErr.message);
    return { keptMe: data.keep === "me" };
  });
