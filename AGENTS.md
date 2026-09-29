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
- Every outside integration (Contra, ID reading, host email, guest messages) has a per-host demo/live switch in hosts.integration_modes (src/lib/integration-modes.ts); server code checks it before calling out. Why: the host tests each connection safely before going live.
- Contra goes through src/lib/contra.server.ts only (demo = sample providers in contra-demo.ts; live = CONTRA_API_KEY + CONTRA_API_BASE_URL); ranking is pure in src/lib/services.ts (tested). Why: swap or extend the marketplace without touching screens.
- Guest requests, host jobs and maintenance share one table, service_jobs; guest ETA updates are rows in messages (channel stay_page). Why: one inbox and one status flow for all work.
- Property theme lives in properties.theme_config, normalised by src/lib/theme.ts and applied via ThemeScope (CSS variables); vanity links /$slug reuse properties.short_code. Why: one source of truth per tenant, safe against bad input.
- Stay guides reuse guides/guide_steps: one guides row per (property, room or null, section_key); room rows override house rows; merging, basic/detailed, the forget card and link window are pure in src/lib/guide.ts (tested). Photos live in the private "guides" bucket as paths and are shown via short-lived signed links. Why: write shared sections once, keep guest photos private.
- Guide links are stay_tokens with valid_from (arrival-day midnight, property time) and expires_at (check-out time); hosts mint fresh ones from the booking window since only hashes are stored. Why: late arrivals need "Getting in" before self check-in.
