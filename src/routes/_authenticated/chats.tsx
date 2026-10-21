import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { ChatsPanel } from "@/components/ChatsPanel";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_authenticated/chats")({
  component: ChatsLayout,
});

function ChatsLayout() {
  const { userId } = Route.useRouteContext();
  const matchRoute = useMatchRoute();
  const thread = matchRoute({ to: "/chats/$chatId", fuzzy: true });
  return <div className="h-dvh md:h-full md:flex">
    <aside aria-label="Conversations" className={`${thread ? "hidden md:block" : "block"} h-full md:w-80 lg:w-[340px] shrink-0 border-r border-border`}><ChatsPanel userId={userId} activeChatId={thread ? thread.chatId : undefined} /></aside>
    <section className={`${thread ? "block" : "hidden md:block"} flex-1 min-w-0 h-full`}><Outlet /></section>
    {!thread && <BottomNav />}
  </div>;
}
