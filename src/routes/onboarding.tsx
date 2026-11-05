import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/storage";
import { Avatar } from "@/components/Avatar";
import { ImageCropper } from "@/components/ImageCropper";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [
    { title: "Set up your profile · SnootChat" },
    { name: "description", content: "Choose your username, display name, and profile photo on SnootChat." },
    { property: "og:title", content: "Set up your profile · SnootChat" },
    { property: "og:description", content: "Choose your username, display name, and profile photo on SnootChat." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      setUserId(data.user.id);
      const meta = data.user.user_metadata as { full_name?: string; name?: string };
      if (meta?.full_name || meta?.name) setDisplayName(meta.full_name ?? meta.name ?? "");
      const { data: existing } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();
      if (existing) {
        navigate({ to: "/chats" });
      }
    });
  }, [navigate]);

  const [cropFile, setCropFile] = useState<File | null>(null);
  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setCropFile(f);
  }
  async function handleAvatar(file: File) {
    setCropFile(null);
    if (!file || !userId) return;
    try {
      const path = `${userId}/${Date.now()}-${file.name}`;
      await uploadFile("avatars", path, file);
      setAvatarPath(path);
      toast.success("Avatar uploaded");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (username.length < 3) return toast.error("Username must be 3+ characters");
    if (!displayName.trim()) return toast.error("Display name is required");
    setSaving(true);
    try {
      const { data: available } = await supabase.rpc("username_available", {
        _username: username,
      });
      if (!available) {
        toast.error("Username is taken");
        return;
      }
      const { error } = await supabase.from("profiles").insert({
        id: userId,
        username,
        display_name: displayName.trim(),
        avatar_url: avatarPath,
      });
      if (error) return toast.error(error.message);
      toast.success("Profile created");
      navigate({ to: "/chats" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {cropFile && <ImageCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={(f) => void handleAvatar(f)} />}
      <form onSubmit={handleSave} className="w-full max-w-md bg-card rounded-3xl border border-border p-8">
        <h1 className="text-2xl font-bold mb-1">Set up your snoot</h1>
        <p className="text-sm text-muted-foreground mb-6">Choose how others will see you.</p>

        <div className="flex items-center gap-4 mb-6">
          <Avatar displayName={displayName || "?"} avatarPath={avatarPath} size={64} />
          <label className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm hover:bg-secondary">
            Upload photo
            <input type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
          </label>
        </div>

        <div className="space-y-3">
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
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-6 w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold hover:opacity-90 disabled:opacity-60"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
