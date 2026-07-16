import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { uploadFile } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { userId } = Route.useRouteContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;
      // Detect Google-only users: they only have oauth identities, no email/password
      const identities = user.identities ?? [];
      const hasEmailIdentity = identities.some((i) => i.provider === "email");
      setHasPassword(hasEmailIdentity);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (profile) {
        setUsername(profile.username);
        setDisplayName(profile.display_name);
        setAvatarPath(profile.avatar_url);
      }
      setLoading(false);
    })();
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

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return toast.error("Display name is required");
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("id", userId);
      if (error) return toast.error(error.message);
      toast.success("Profile saved");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error("Password must be at least 6 characters");
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return toast.error(error.message);
      toast.success(hasPassword ? "Password changed" : "Password set — you can now sign in with email");
      setNewPassword("");
      setHasPassword(true);
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 pb-24">
      <header className="flex items-center gap-3 py-4 sticky top-0 bg-background z-10 border-b border-border">
        <Link to="/chats" className="rounded-full border border-border p-2 hover:bg-secondary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold">Settings</h1>
      </header>

      <section className="mt-6 bg-card border border-border rounded-3xl p-6">
        <h2 className="font-semibold mb-4">Profile</h2>
        <div className="flex items-center gap-4 mb-5">
          <Avatar displayName={displayName || "?"} avatarPath={avatarPath} size={72} />
          <label className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm hover:bg-secondary">
            Change photo
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          </label>
        </div>
        <form onSubmit={handleProfileSave} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Username</label>
            <input
              value={username}
              disabled
              className="w-full rounded-xl bg-input px-4 py-3 opacity-70 cursor-not-allowed mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring mt-1"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-full bg-primary text-primary-foreground px-5 py-2.5 font-medium disabled:opacity-60"
          >
            Save profile
          </button>
        </form>
      </section>

      <section className="mt-6 bg-card border border-border rounded-3xl p-6">
        <h2 className="font-semibold mb-1">{hasPassword ? "Change password" : "Set a password"}</h2>
        <p className="text-xs text-muted-foreground mb-4">
          {hasPassword
            ? "Enter a new password to update it."
            : "You signed in with Google. Set a password to also sign in with email."}
        </p>
        <form onSubmit={handlePasswordSave} className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="w-full rounded-xl bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            required
          />
          <button
            type="submit"
            disabled={savingPassword}
            className="rounded-full bg-primary text-primary-foreground px-5 py-2.5 font-medium disabled:opacity-60"
          >
            {hasPassword ? "Update password" : "Set password"}
          </button>
        </form>
      </section>

      <section className="mt-6">
        <button
          onClick={handleSignOut}
          className="w-full rounded-full border border-border py-3 font-medium hover:bg-secondary"
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
