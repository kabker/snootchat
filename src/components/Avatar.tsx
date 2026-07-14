import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveStorageUrl } from "@/lib/storage";
import { initialsOf, colorFromString } from "@/lib/chat-presets";

export function Avatar({
  displayName,
  avatarPath,
  size = 40,
}: {
  displayName: string;
  avatarPath?: string | null;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!avatarPath) {
      setUrl(null);
      return;
    }
    resolveStorageUrl(avatarPath, "avatars").then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  const initials = initialsOf(displayName);
  const bg = colorFromString(displayName);
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0 overflow-hidden"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.4 }}
    >
      {url ? (
        <img src={url} alt={displayName} className="w-full h-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

export function useCurrentUser() {
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? null });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return user;
}
