import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// Sign in by username without ever revealing the account's email to the browser.
export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ username: z.string().trim().toLowerCase().min(1).max(64), password: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const fail = { error: "Invalid username or password" } as const;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("username", data.username).maybeSingle();
    if (!prof) return fail;
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(prof.id);
    const email = u.user?.email;
    if (!email) return fail;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const client = createClient(process.env.SUPABASE_URL!, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: s, error } = await client.auth.signInWithPassword({ email, password: data.password });
    if (error || !s.session) {
      if (error?.message.toLowerCase().includes("confirm")) return { error: "Please verify your email first" };
      return fail;
    }
    return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
  });
