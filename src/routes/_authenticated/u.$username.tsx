import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { createDMChat, getProfileByUsername, type ProfileLite } from "@/lib/chats";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/u/$username")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Profile · SnootChat" },
      { name: "description", content: "View a SnootChat member's profile and start a chat request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Profile · SnootChat" },
      { property: "og:description", content: "View a SnootChat member's profile and start a chat request." },
    ],
  }),
});

function ProfilePage() {
  const { username } = Route.useParams();
  const { userId } = Route.useRouteContext();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProfileByUsername(username)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const [bio, setBio] = useState("");
  useEffect(() => {
    setBio("");
    if (!profile) return;
    supabase.from("profiles").select("bio").eq("id", profile.id).maybeSingle().then(({ data }) => setBio(data?.bio ?? ""));
  }, [profile]);

  async function startChat() {
    if (!profile) return;
    setBusy(true);
    try {
      const id = await createDMChat(userId, profile.id);
      navigate({ to: "/chats/$chatId", params: { chatId: id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4">
      <header className="flex items-center gap-3 py-4">
        <button onClick={() => navigate({ to: "/chats" })} className="p-2 rounded-full hover:bg-secondary" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Profile</h1>
      </header>

      {loading ? (
        <p className="text-center text-muted-foreground py-16">Loading…</p>
      ) : !profile ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No user named @{username}.</p>
          <Link to="/chats" className="mt-4 inline-block underline text-sm">Back to chats</Link>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center pt-6">
          <Avatar displayName={profile.display_name} avatarPath={profile.avatar_url} size={112} />
          <h2 className="mt-4 text-2xl font-bold">{profile.display_name}</h2>
          <p className="text-muted-foreground">@{profile.username}</p>
          {bio && <p className="mt-3 max-w-sm whitespace-pre-wrap text-sm">{bio}</p>}
          {profile.id === userId ? (
            <Link to="/settings" className="mt-6 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary">
              Edit your profile
            </Link>
          ) : (
            <button
              onClick={startChat}
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 font-medium disabled:opacity-60"
            >
              <MessageCircle className="w-4 h-4" />
              Send chat request
            </button>
          )}
        </div>
      )}
    </div>
  );
}
