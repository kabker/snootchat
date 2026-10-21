import { createFileRoute } from "@tanstack/react-router";
import logo from "@/assets/snoot-logo.png";

export const Route = createFileRoute("/_authenticated/chats/")({
  head: () => ({ meta: [
    { title: "Chats · SnootChat" },
    { name: "description", content: "Your conversations and chat requests on SnootChat." },
    { property: "og:title", content: "Chats · SnootChat" },
    { property: "og:description", content: "Your conversations and chat requests on SnootChat." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <div className="hidden md:flex h-full flex-col items-center justify-center text-center gap-3"><img src={logo} alt="" className="size-20 object-contain" /><h1 className="text-2xl font-bold">SnootChat</h1><p className="text-muted-foreground text-sm">Your conversations, all in one place.</p></div>,
});
