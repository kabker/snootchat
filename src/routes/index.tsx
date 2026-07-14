import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import logo from "@/assets/snoot-logo.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      // Check onboarding
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (!profile) throw redirect({ to: "/onboarding" });
      throw redirect({ to: "/chats" });
    }
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-preset-midnight">
      <img src={logo} alt="SnootChat" className="w-28 h-28 mb-6" width={512} height={512} />
      <h1 className="text-5xl font-bold tracking-tight">SnootChat</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        A cozy place to chat. Ask before you message, pick your vibe, and make every thread yours.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          to="/auth"
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
        >
          Get started
        </Link>
        <Link
          to="/auth"
          search={{ mode: "signin" }}
          className="rounded-full border border-border px-6 py-3 font-medium hover:bg-secondary"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
