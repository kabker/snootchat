import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { uploadFile } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [
    { title: "Profile · SnootChat" },
    { name: "description", content: "Customize your SnootChat profile picture and display name." },
    { property: "og:title", content: "Profile · SnootChat" },
    { property: "og:description", content: "Customize your SnootChat profile picture and display name." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { userId } = Route.useRouteContext();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUsername(data.username);
          setDisplayName(data.display_name);
          setAvatarPath(data.avatar_url);
        }
        setLoading(false);
      });
  }, [userId]);

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const path = `${userId}/${Date.now()}-${file.name}`;
      await uploadFile("avatars", path, file);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", userId);
      if (error) return toast.error(error.message);
      setAvatarPath(path);
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return toast.error("Display name is required");
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("id", userId);
      if (error) return toast.error(error.message);
      toast.success("Profile saved");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-5 md:px-10 pb-24 md:pb-10">
      <header className="flex items-center gap-3 py-3 sticky top-0 bg-background z-10">
        <Link to="/chats" className="rounded-full bg-secondary p-2 hover:opacity-90">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold">Profile</h1>
      </header>

      <section className="mt-6">
        <h2 className="font-semibold mb-4">Customize profile</h2>
        <div className="flex items-center gap-4 mb-5">
          <Avatar displayName={displayName || "?"} avatarPath={avatarPath} size={72} />
          <label className="cursor-pointer rounded-full bg-background px-4 py-2 text-sm font-medium text-primary hover:opacity-90">
            Change photo
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          </label>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Username</label>
            <input
              value={username}
              disabled
              className="w-full rounded-lg bg-input px-4 py-3 opacity-70 cursor-not-allowed mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring mt-1"
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="rounded-full bg-primary text-primary-foreground px-5 py-2.5 font-medium disabled:opacity-60"
          >
            Save profile
          </Button>
        </form>
      </section>
      <BottomNav />
    </div>
  );
}
