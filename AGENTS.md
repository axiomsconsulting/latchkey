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
- Cross-platform matching per room lives in src/lib/room-reconcile.ts (pure, tested) and runs after every calendar sync; nameless entries overlapping a real stay on another platform are stored as blocked mirrors (bookings.mirror_of), named overlaps become flagged. Why: hosts without a channel manager link calendars to each other, so one stay shows up on several feeds.
