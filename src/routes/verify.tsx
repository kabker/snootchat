import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import logo from "@/assets/snoot-logo.png";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ email: z.string().email().optional() });

export const Route = createFileRoute("/verify")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [
    { title: "Verify your email · SnootChat" },
    { name: "description", content: "Confirm your email address to start chatting on SnootChat." },
    { property: "og:title", content: "Verify your email · SnootChat" },
    { property: "og:description", content: "Confirm your email address to start chatting on SnootChat." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: VerifyPage,
});

async function ensureProfileFor(userId: string) {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existing) return;
  const raw = sessionStorage.getItem("snoot:pending-profile");
  if (!raw) return;
  const p = JSON.parse(raw) as { username: string; display_name: string };
  const { error } = await supabase.from("profiles").insert({
    id: userId,
    username: p.username,
    display_name: p.display_name,
  });
  if (error && !error.message.includes("duplicate")) throw error;
  sessionStorage.removeItem("snoot:pending-profile");
}

function VerifyPage() {
  const { email: qEmail } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState(qEmail ?? "");
  const [resending, setResending] = useState(false);

  // If the user clicked the confirmation link in their email, they arrive here
  // (or on the root) with an active session — finish profile setup and continue.
  useEffect(() => {
    let cancelled = false;
    async function handleSession(userId: string) {
      try {
        await ensureProfileFor(userId);
      } catch (err) {
        toast.error((err as Error).message);
        return;
      }
      if (cancelled) return;
      toast.success("Email verified!");
      navigate({ to: "/chats" });
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) handleSession(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user) {
        handleSession(session.user.id);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function handleResend() {
    if (!email) return toast.error("Enter your email");
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) return toast.error(error.message);
      toast.success("Verification email sent");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card rounded-3xl border border-border p-8 shadow-2xl text-center">
        <div className="flex flex-col items-center mb-6">
          <img src={logo} alt="" className="w-16 h-16" width={512} height={512} />
          <h1 className="mt-3 text-2xl font-bold">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a verification link to{" "}
            <span className="text-foreground font-medium">{email || "your inbox"}</span>. Click it
            to verify your email — it might be in your <span className="text-foreground">spam folder</span>.
          </p>
        </div>

        {!qEmail && (
          <input
            type="email"
            className="w-full rounded-xl bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring mb-3 text-left"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}

        <p className="text-xs text-muted-foreground">
          Once you click the link in the email, this page will continue automatically.
        </p>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-primary font-medium disabled:opacity-60"
          >
            {resending ? "Sending…" : "Resend email"}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
            className="text-muted-foreground"
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}

