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
