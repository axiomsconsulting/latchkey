# Notes for Dev: how Swapnil wants Latchkey work done

Written for Dev (the AI agent that reviews this repo and writes build prompts for Claude Code), on 27 October 2026, after building agreement v1.0 (signing, identity checks, activation and fixes) from your prompt. Please follow these in future prompts. `AGENTS.md` holds the technical rules; this file covers how Swapnil wants the work run, and where the last prompt needed correcting.

## 1. Swapnil's standing instructions

1. **Branch, check, then merge, for every change.**
   - Create a feature branch from an up-to-date `main`.
   - Run the type check and the full test suite.
   - Merge into `main` as one squashed commit; that adds a new commit and never rewrites history.
   - Never commit or push to `main` directly. Local git hooks refuse it.
   - `gh` is installed. Swapnil runs `gh auth login` once; until then, merge locally with a squash and push `main` once. You don't need to say this again in prompts.
2. **Don't stop between phases.** Swapnil asked Claude Code to run all phases in one go and report at the end. Write prompts with phases for structure, but without "stop and wait for OK".
3. **Google Drive is the only store for private images and signed documents.**
   - What it covers: guests' kept ID and face photos, Commission Partners' ID photos and selfies, drawn signatures, signed agreement PDFs.
   - If Drive is unreachable, the file waits in a Lovable storage queue. It moves to Drive, is checked, and only then is the queued copy deleted.
   - Text records (details read, results, signing evidence) stay in the database for compliance.
   - Retention deletes from Drive (deleted, not binned).
   - Don't propose Supabase storage as the default, or Drive as an optional flag.
4. **Be truthful in legal text.**
   - Don't overclaim, for example "not used to train models" when we can only say we ask the provider not to keep images.
   - Visitor profiles for statistics are wanted, as long as they're legal and disclosed. The privacy policy now says what's collected.
   - Raise anything that might need consent, for example under PECR, as a question for the solicitor. Don't decide it in code.
5. **Swapnil wants to take real payments.** Give a clear go-live checklist. Live Stripe stays behind secrets that only Swapnil sets: the code never switches to live by itself, and prompts shouldn't ask Claude Code to.
6. **No solicitor or accountant at this stage.** Swapnil asked Claude Code to take both roles: draft agreements in OMS's favour but enforceable (fair to consumer partners), and set VAT and self-billing rules. Claude Code may edit the agreement when Swapnil asks, or when the text can't be built as written, by publishing a new version (published text is locked). Every change is listed in the summary and in `docs/commission-partners.md`. v1.1 is in force.
7. **Read-only database checks on the live project are allowed** (Lovable `query_database`, `SELECT` only). Never write to the live database, never publish, and never trigger a Lovable build.

## 2. Corrections to the last prompt

1. **"The previous run ignored the branch rule."** It didn't. Swapnil had said "There is no need for a branch". The rule is new as of 27 October.
2. **"main auto-syncs to Lovable, which applied migration 0061 and published the site."**
   - Pushing to `main` updates Lovable's editor. The live site (latchkey.omsestates.uk) changes only when Swapnil presses Publish.
   - Swapnil ran migration 0061 themselves.
   - Migrations from a merge can still reach the live database, so they must be additive.
3. **"Merge only if build, typecheck, lint and tests all pass."** Lint used to fail on `main` (about 12,000 old formatting errors). Since 27 October it passes with 0 errors, so lint is now a merge check like the others.
4. **`gh pr create`.** `gh` wasn't installed on 27 October. It is now, but it needs signing in once.

## 3. Where Claude Code deliberately departed from the prompt

1. **Late referral codes (6.2).**
   - "Only in the same request that creates the host account" would break the set-up code box, because the business record is created before the host types the code.
   - Built instead: allowed only until set-up saves its first property, and never more than a day after the account was made.
2. **`PARTNER_SIGNUPS_OPEN` env flag.** Replaced by a Programme decisions switch, so opening sign-ups needs no deploy. It still defaults to closed.
3. **Drive flags (`PARTNER_ID_DRIVE_UPLOAD`, `partnerIdDriveOnly`).** Not needed, because Drive is always the store. `partnerIdImagesStored` became `idImagesStored`.
4. **Signed PDF.**
   - Lovable's email can't carry attachments. The email has a link and the account keeps the PDF, and clause 4.4 was reworded to say so.
   - The PDF uses pdf-lib's built-in Helvetica, so no font file ships. A name in a non-Latin script appears in transliteration in the PDF; the exact typed name stays in the signing record.
5. **Controller details in the privacy notice.** They come from Latchkey admin → Site settings → Legal rather than hard-coded text. The live settings are incomplete, see the next section.
6. **Payout readiness (12.4(b)).** Built as asked: transfers on, payouts on, nothing currently or past due. Note that full-dashboard accounts also ask for `card_payments`, so Stripe may list requirements for card payments. Those also pause payouts until the partner finishes them.

## 4. Live facts as of 27 October (read-only checks)

- **Scheduled routines aren't running.**
  - `calendar_sync` has never run, and `retention` has no row at all.
  - Nothing calls `/api/public/cron/latchkey`, so calendar sync, the privacy clean-up and the Drive queue only run from Latchkey admin → Routines → Run now.
  - Lovable needs scheduled POSTs set up: `sync` every 30 minutes, `retention` daily, and `commission_close` daily once it's switched on.
- **Stripe.**
  - The Trinity Suites' connected account is in test mode, and no guest payment has succeeded yet.
  - `stripe_events` is empty, so no partner webhook events have been received.
  - `stripePlatformProfileConfirmed` (D1) is already ticked.
- **Pricing.** The pricing studio model isn't published, so the old `platform_pricing` price applies. The launch offer (£1 first month) runs until 31 December 2026.
- **Legal settings are deliberately incomplete.** Swapnil runs Latchkey in their own name for now; Omnispace Estates Ltd is **not** the operator and must not be written into any text. Swapnil fills in Latchkey admin → Site settings → Legal details when ready, and moves the business to a company later (agreement 1.5 and 23.3). Partner signing stays closed until the legal name and address are filled in.
- **Cookie banner** is live in code (PECR): no statistics or partner cookies before "Accept".
- **Google Drive** is connected. Its OAuth app must be "In production", or Google ends the connection after 7 days.
- **Integrations in use.** Email and Telegram alerts have sent, push has 2 subscriptions, and inbound email (Postmark) is configured.

## 5. Writing prompts for this repo

- Name files and functions as they are now; `AGENTS.md` has a bullet per area. Line numbers go stale quickly, so give a function name as well.
- Every change adds a `src/content/changelog.ts` entry (`admin: true` for Latchkey-admin-only items).
- User-facing copy: British English, no em dashes, "Commission Partner" or "independent Latchkey Commission Partner" (never "introducer", "affiliate" or "OMS partner").
- Partner Stripe accounts are v1 with the full Stripe dashboard (`partnerAccountBody`). `EXPRESS_COUNTRIES` and the route `"express"` are legacy names for "Stripe transfer country".
- When a prompt and the agreement disagree, the agreement wins, and Claude Code says so in its summary.
