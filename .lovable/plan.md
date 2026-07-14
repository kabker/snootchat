# SnootChat — Build Plan

A real-time chat app with request-to-chat, group chats, customizable backgrounds and message bubbles.

## Stack

- TanStack Start + Tailwind v4 design system
- Lovable Cloud (Supabase) for auth, DB, realtime, storage
- Email/password + Google sign-in

## Auth & Onboarding

- Sign up with email OR Google
- Required profile fields: username (unique), display name, password (email flow), optional avatar upload
- Default avatar = display name initials on a colored circle (generated in CSS, no upload needed)
- After Google sign-in, force a one-time onboarding screen to set username + display name + optional avatar

## Core Data Model

- `profiles` (id → auth.users, username unique, display_name, avatar_url)
- `chats` (id, is_group, name, background_type ['preset'|'custom'], background_value, created_by)
- `chat_members` (chat_id, user_id, status ['pending'|'accepted'|'declined'], bubble_color ['blue'|'purple'|'black'|'white'], role)
- `chat_requests` (id, chat_id, from_user, to_user, status) — used for 1:1 initial request AND group invites
- `messages` (id, chat_id, sender_id, body, created_at, delivered_at, read_at)
- RLS: users only see chats where they are an accepted member; pending members can see the request but not messages
- Storage buckets: `avatars` (public), `chat-backgrounds` (public)

## Chat Requests

- Starting a DM sends a request; recipient sees it in a "Requests" tab
- Accept → chat becomes visible with full history (empty at start); Decline → removed
- Group chats: creator adds members; each invitee must accept before reading/sending

## Backgrounds

- 8 preset backgrounds (gradients/patterns defined as design tokens)
- Custom upload per chat → stored in `chat-backgrounds` bucket; all members see it
- Anyone in the chat can change it (or restrict to creator — will restrict to creator for groups, either party for DMs)

## Message Bubbles

- Each member picks their own sender bubble color (blue / purple / black / white) for every chat
- Stored on `chat_members.bubble_color`
- Received bubbles always gray
- White bubble uses a subtle border for contrast

## Message Status

- `sent` when insert succeeds
- `delivered` when recipient's client receives it via realtime (updates `delivered_at`)
- Single/double check icons under sender's own messages

## Realtime

- Supabase Realtime on `messages`, `chat_members`, `chat_requests`
- Client marks incoming messages delivered on receipt

## UI Structure

- `/auth` — sign in / sign up (email + Google)
- `/onboarding` — set username/display name/avatar (first login)
- `/_authenticated/` protected layout
  - `/` — chat list + requests tab, new-chat button, search users
  - `/chat/$chatId` — message thread, background applied, bubble color picker, background picker, member list, add-people (group)

## Design

- Dark, cozy messaging aesthetic — not generic AI purple. Warm neutrals with a distinctive accent. Semantic tokens for all bubble colors, backgrounds, surfaces. Custom shadcn variants; no ad-hoc color classes.
- Logo/wordmark for SnootChat generated as an asset.

## Build Order

1. Enable Cloud, migrations (tables, RLS, storage buckets, has_role-style helpers not needed here)
2. Design system + SnootChat logo
3. Auth pages + Google provider config + onboarding
4. Chat list + requests + new chat flow
5. Chat thread with realtime, delivered/sent, bubble + background pickers
6. Group chat creation + invite accept
7. Polish, sitemap/robots, head metadata

Approve to build?