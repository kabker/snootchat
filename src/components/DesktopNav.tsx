import { Link } from "@tanstack/react-router";
import { MessageCircle, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import logo from "@/assets/snoot-logo.png";

export function DesktopNav({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<{ display_name: string; avatar_url: string | null } | null>(null);
  useEffect(() => {
    supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle().then(({ data }) => setProfile(data));
  }, [userId]);
  return <nav aria-label="Main navigation" className="hidden md:flex w-20 shrink-0 flex-col items-center gap-4 border-r border-border bg-secondary/50 py-5">
    <Link to="/chats" title="SnootChat" className="mb-3"><img src={logo} alt="SnootChat" className="size-9 object-contain" /></Link>
    <Button asChild variant="ghost" size="icon" className="size-12 rounded-xl"><Link to="/chats" title="Chats" aria-label="Chats" activeProps={{ className: "bg-accent text-primary" }}><MessageCircle className="size-6" /></Link></Button>
    <Button asChild variant="ghost" size="icon" className="size-12 rounded-xl"><Link to="/settings" title="Settings" aria-label="Settings" activeProps={{ className: "bg-accent text-primary" }}><Settings className="size-6" /></Link></Button>
    <Link to="/settings" title="Your profile" aria-label="Your profile" className="mt-auto"><Avatar displayName={profile?.display_name ?? "Me"} avatarPath={profile?.avatar_url} size={38} /></Link>
  </nav>;
}