import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import logo from "@/assets/snoot-logo.png";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ email: z.string().email().optional() });

export const Route = createFileRoute("/verify")({
  validateSearch: (s) => searchSchema.parse(s),
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
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
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


  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return toast.error("Enter your email");
    if (code.length < 4) return toast.error("Enter the code from your email");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "signup",
      });
      if (error) return toast.error(error.message);
      if (!data.user) return toast.error("Verification failed");
      try {
        await ensureProfileFor(data.user.id);
      } catch (err) {
        toast.error((err as Error).message);
        return;
      }
      toast.success("Verified!");
      navigate({ to: "/chats" });
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!email) return toast.error("Enter your email");
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) return toast.error(error.message);
      toast.success("New code sent");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-preset-midnight px-4">
      <form
        onSubmit={handleVerify}
        className="w-full max-w-md bg-card rounded-3xl border border-border p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-6">
          <img src={logo} alt="" className="w-16 h-16" width={512} height={512} />
          <h1 className="mt-2 text-2xl font-bold">Enter your code</h1>
          <p className="mt-1 text-sm text-muted-foreground text-center">
            We emailed a verification code to{" "}
            <span className="text-foreground font-medium">{email || "your inbox"}</span>. It might be
            in your spam folder.
          </p>
        </div>

        {!qEmail && (
          <input
            type="email"
            className="w-full rounded-xl bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring mb-3"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}

        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          className="w-full rounded-xl bg-input px-4 py-4 text-center text-2xl tracking-[0.5em] font-mono outline-none focus:ring-2 focus:ring-ring"
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          required
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Verifying…" : "Verify"}
        </button>

        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-primary font-medium disabled:opacity-60"
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
            className="text-muted-foreground"
          >
            Back to sign in
          </button>
        </div>
      </form>
    </div>
  );
}
