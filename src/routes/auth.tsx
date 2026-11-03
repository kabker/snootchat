import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import logo from "@/assets/snoot-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { signInWithUsername } from "@/lib/signin.functions";

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [
    { title: "Sign in or join · SnootChat" },
    { name: "description", content: "Sign in or create a SnootChat account to connect with friends." },
    { property: "og:title", content: "Sign in or join · SnootChat" },
    { property: "og:description", content: "Sign in or create a SnootChat account to connect with friends." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(initMode ?? "signup");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  async function handleGoogle() {
    try {
      setLoading(true);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (username.length < 3) return toast.error("Username must be at least 3 characters");
        if (displayName.length < 1) return toast.error("Display name is required");
        if (password.length < 6) return toast.error("Password must be at least 6 characters");

        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", username)
          .maybeSingle();
        if (existing) return toast.error("Username is taken");

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/verify?email=${encodeURIComponent(email)}`,
            data: { username, display_name: displayName },
          },
        });
        if (error) return toast.error(error.message);

        // Stash pending profile details so /verify can create the profile once the session exists.
        sessionStorage.setItem(
          "snoot:pending-profile",
          JSON.stringify({ email, username, display_name: displayName }),
        );
        toast.success("Check your email to verify your account");
        navigate({ to: "/verify", search: { email } });
      } else {
        const id = email.trim();
        if (!id.includes("@")) {
          const res = await signInWithUsername({ data: { username: id.replace(/^@/, ""), password } });
          if ("error" in res) return toast.error(res.error);
          const { error } = await supabase.auth.setSession(res);
          if (error) return toast.error(error.message);
          navigate({ to: "/" });
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email: id, password });
        if (error) {
          if (error.message.toLowerCase().includes("confirm")) {
            toast.error("Please verify your email first");
            navigate({ to: "/verify", search: { email: id } });
            return;
          }
          return toast.error(error.message);
        }
        navigate({ to: "/" });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card rounded-3xl border border-border p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <img src={logo} alt="" draggable={false} className="w-16 h-16 object-contain" width={512} height={512} />
          <h1 className="mt-2 text-2xl font-bold">
            {mode === "signup" ? "Join SnootChat" : "Welcome back"}
          </h1>
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-bubble-white text-bubble-white-foreground rounded-full py-3 font-medium hover:opacity-90 disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <>
              <input
                className="w-full rounded-xl bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                required
              />
              <input
                className="w-full rounded-xl bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </>
          )}
          <input
            type="email"
            className="w-full rounded-xl bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="w-full rounded-xl bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button
            className="text-primary font-medium"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}
