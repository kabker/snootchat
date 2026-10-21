import { Link } from "@tanstack/react-router";
import { MessageCircle, Settings } from "lucide-react";

export function BottomNav() {
  const item = "flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground";
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background md:hidden">
      <div className="max-w-2xl mx-auto flex">
        <Link to="/chats" className={item} activeProps={{ className: "text-primary" }} activeOptions={{ exact: true }}>
          <MessageCircle className="w-6 h-6" />
          Chats
        </Link>
        <Link to="/settings" className={item} activeProps={{ className: "text-primary" }}>
          <Settings className="w-6 h-6" />
          Settings
        </Link>
      </div>
    </nav>
  );
}
