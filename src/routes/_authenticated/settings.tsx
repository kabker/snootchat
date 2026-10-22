import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [
    { title: "Settings · SnootChat" },
    { name: "description", content: "Manage your SnootChat password and account settings." },
    { property: "og:title", content: "Settings · SnootChat" },
    { property: "og:description", content: "Manage your SnootChat password and account settings." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [hasPassword, setHasPassword] = useState(true);
  const [newPassword, setNewPassword] = useState("");
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
    })();
  }, []);

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

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-5 md:px-10 pb-24 md:pb-10">
      <header className="flex items-center gap-3 py-3 sticky top-0 bg-background z-10">
        <Link to="/chats" className="rounded-full bg-secondary p-2 hover:opacity-90">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>

      <section className="mt-6 border-b border-border pb-6">
        <Link
          to="/profile"
          className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3.5 font-medium hover:opacity-90"
        >
          <span>Profile</span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            Name & photo
            <ChevronRight className="w-4 h-4" />
          </span>
        </Link>
      </section>

      <section className="mt-6 border-b border-border pb-8">
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
            className="w-full rounded-lg bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            required
          />
          <Button
            type="submit"
            disabled={savingPassword}
            className="rounded-full bg-primary text-primary-foreground px-5 py-2.5 font-medium disabled:opacity-60"
          >
            {hasPassword ? "Update password" : "Set password"}
          </Button>
        </form>
      </section>

      <section className="mt-6">
        <Button
          onClick={handleSignOut}
          variant="secondary" className="w-full rounded-lg py-3 font-semibold text-destructive"
        >
          Sign out
        </Button>
      </section>
      <BottomNav />
    </div>
  );
}
