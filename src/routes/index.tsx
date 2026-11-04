import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import logo from "@/assets/snoot-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "SnootChat — Chat with friends" },
      { name: "description", content: "SnootChat: request-to-chat messaging with groups, custom backgrounds and bubble colors." },
      { property: "og:title", content: "SnootChat — Chat with friends" },
      { property: "og:description", content: "Request-to-chat messaging with groups, custom backgrounds and bubble colors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile) throw redirect({ to: "/onboarding" });
    throw redirect({ to: "/chats" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background">
      <img src={logo.url} alt="SnootChat" draggable={false} className="w-24 h-24 mb-8 object-contain" width={512} height={512} />
      <h1 className="text-4xl font-bold tracking-tight text-foreground">Hang out anytime, anywhere</h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        SnootChat makes it easy and fun to stay close to your favorite people.
      </p>
      <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
        <Link to="/auth" search={{ mode: "signup" }} className="rounded-full bg-primary py-3 font-semibold text-primary-foreground hover:opacity-90">
          Get started
        </Link>
        <Link
          to="/auth"
          search={{ mode: "signin" }}
          className="rounded-full bg-secondary py-3 font-semibold text-secondary-foreground hover:opacity-90"
        >
          Log in
        </Link>
      </div>
      <p className="mt-12 text-xs text-muted-foreground">SnootChat</p>
    </div>
  );
}
