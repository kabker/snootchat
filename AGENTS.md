<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- The authenticated layout owns the desktop navigation rail; the chats layout owns the shared chat list and child outlet so conversations retain list navigation.
- Use the shared ChatsPanel for chat list, search, requests, and new-chat actions; keep these existing data operations together to avoid divergent desktop and mobile behavior.
- Keep calling in the root CallProvider keyed by signed-in identity so incoming calls and active media survive route changes without modifying the managed authentication layout.
- Use simple-peer loaded on demand for browser WebRTC, with accepted-member-only database signaling and heartbeat-based call expiry; stop local tracks and destroy peers on exit.
- Store image messages as private chat-images paths in attachment_path, not encoded text bodies; signed URLs preserve member access and native GIF playback.
