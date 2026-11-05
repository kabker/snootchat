import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Permanently deletes the signed-in account. Groups they created are handed to another member first.
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: groups } = await supabaseAdmin.from("chats").select("id").eq("created_by", userId).eq("is_group", true);
    for (const g of groups ?? []) {
      const { data: heir } = await supabaseAdmin.from("chat_members").select("user_id").eq("chat_id", g.id).eq("status", "accepted").neq("user_id", userId).limit(1).maybeSingle();
      if (heir) {
        await supabaseAdmin.from("chats").update({ created_by: heir.user_id }).eq("id", g.id);
        await supabaseAdmin.from("chat_members").update({ role: "owner" }).eq("chat_id", g.id).eq("user_id", heir.user_id);
      }
    }
    await supabaseAdmin.from("nicknames").delete().or(`owner_id.eq.${userId},target_id.eq.${userId}`);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
