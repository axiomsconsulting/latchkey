# Commission Partner payouts: status, set-up and test checklist

> Agreement **v1.0** (docs/legal/partner-agreement-v1.0.md) is now the contract the code follows. The sections below from "What's built" were written for draft v0.5 and still describe the engine; "Agreement v1.0 on the website" further down covers signing, identity checks, activation, the fixes and the clause map.

Built from Dev's prompt (`claude_code_prompt_stripe_global_payouts.md`, agreement draft v0.5), 26 Oct 2026. Stripe **test mode only**. Nothing here moves real money unless `PARTNER_PAYOUTS_ALLOW_LIVE="true"` is set, and even then live Express accounts stay blocked until `stripePlatformProfileConfirmed` (D1) is switched on.

## What's built

| Phase | What | Where |
|---|---|---|
| 0 | Config with every open decision as a setting (`TODO(Dx)`), test-mode Stripe client with Idempotency-Key and v2 support | `src/lib/partner-config.ts`, `src/lib/partner-stripe.server.ts` |
| 1 | Schema: partners, effective-dated `commission_terms` (seed `v0.5-launch`, no bonus), identity keys, clicks, referrals, `partner_charges`, `stripe_events`, add-only `commission_ledger`, `launch_bonus_claims`, payouts, clawbacks, audit log, fraud flags, RLS | `drizzle/migrations/0061_commission_partners.sql` |
| 2 | Commission engine (pure) | `src/lib/commission.ts` |
| 3 | `?ref=` cookie (60 days, first wins), click recording, set-up code field, identity hashing, fraud checks | `src/lib/attribution.ts`, `partner-referrals.functions.ts`, `partner-fraud.ts`, `partner-identity*.ts`, `ReferralCodeField.tsx` |
| 4 | Idempotent webhook handling, run before the existing branches | `partner-webhook.ts`, `partner-webhook.server.ts`, one block in `routes/api/public/stripe-webhook.ts` |
| 5 | `/partners/join` (apply), `/partners` (partner's own account), Express onboarding, Latchkey admin → Commission Partners tab | `partners.functions.ts`, `partner-eligibility.ts`, `PartnerAdmin.tsx` |
| 6 | Month close (bonus check, release, fraud re-checks, IP hash purge, clawback follow-up, draft payouts), approve and send, manual route, reversals, CSV statements, `commission_close` routine (starts off) | `partner-close*.ts`, `jobs.ts`, `routes/api/public/cron/latchkey.ts` |
| 7 | Global Payouts adapter, off behind three switches | `global-payouts.server.ts` |

Tests: `tests/partner-guards`, `partner-db` (PGlite + RLS), `commission`, `partner-fraud`, `referrals`, `attribution`, `partner-webhook`, `partner-eligibility`, `payout-run`, `jobs`.

## Before testing

1. **Migration 0061.** It's on `main`, so Lovable will apply it with the next sync. It only adds new tables, plus one new column on `site_settings`. Until it's applied, every partner screen says "Not set up yet", and the webhook carries on exactly as before.
2. **Secrets (Lovable Cloud):**
   - `STRIPE_TEST_API_KEY` (an `sk_test_` or `rk_test_` key).
   - `PARTNER_IDENTITY_HASH_SECRET` (any random string of 32+ characters). Without it, referral attach and the fraud checks fail closed.
   - Optional: `PUBLIC_SITE_URL`.
   - Never set `PARTNER_PAYOUTS_ALLOW_LIVE` while testing.
3. **Stripe webhooks.** Add these events:
   - **Platform endpoint** (`/api/public/stripe-webhook`): `invoice.paid`, `invoice.payment_failed`, `charge.succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `transfer.reversed`.
   - **Connect endpoint:** `account.updated` (already there for hosts), `payout.failed`.
   - **Locally:** `stripe listen --forward-to localhost:<port>/api/public/stripe-webhook --events invoice.paid,invoice.payment_failed,charge.succeeded,charge.refunded,charge.dispute.created,charge.dispute.closed,account.updated,transfer.reversed,payout.failed`.
4. **Stripe platform profile (test mode first, then live).** Partner accounts must match Latchkey's Connect platform profile ([Settings → Connect → Platform setup](https://dashboard.stripe.com/settings/connect/platform-profile)). Today that profile says Stripe is responsible for losses (`losses.payments: stripe`), the account pays its own fees (`fees.payer: account`), full Stripe dashboard, and Stripe-hosted onboarding. So partner accounts are v1 accounts with exactly that `controller`. They ask for `card_payments` and `transfers`, because Stripe refuses transfers alone on a full-dashboard account; Latchkey only ever sends them transfers. Stripe's onboarding will therefore ask partners a few business questions (what they do, a website or description). If the profile is changed, `partnerAccountBody` must change with it, or Stripe refuses new accounts. Accounts v2 is "Requested" and isn't needed. Transfers cross borders only where Stripe allows it for full-dashboard accounts (UK, EEA and Switzerland); US and Canadian partners may be refused until Accounts v2 or Global Payouts is in place. If set-up fails, the partner sees a plain message, and the partner's log in Latchkey admin has `stripe_platform_setup_needed` with Stripe's code. Live needs the same in live mode, plus `stripePlatformProfileConfirmed` (D1).

## Manual test checklist (test mode)

**Setup**
- [ ] With only the seed terms, no Launch Bonus is ever created. Add a test terms row in Latchkey admin → Commission Partners → Commission terms with a £5 bonus and an end date.

**Commission Partners**
- [ ] Apply as a UK partner and as an Irish one; approve them; complete Stripe onboarding with Stripe test data. "Stripe can pay" should show after `account.updated` or "Check again". Every screen should say "Commission Partner".
- [ ] Apply from India: the partner is waitlisted (default D2).
- [ ] Set only a live key: onboarding and payouts refuse.

**Referrals and fraud checks**
- [ ] Open `/?ref=CODE`, close the tab, reopen and sign up a host. The referral is in "Referrals to review" with its terms. Approve it.
- [ ] Self-referral: a host with the partner's email, phone or card is auto-rejected (strong). The same device or IP is flagged (weak). An override with a reason works and is logged.
- [ ] Re-registration with the same email or card (same partner, then another) is flagged, and no second bonus is paid.
- [ ] Five sign-ups on one code within 24 hours raise a burst flag.

**Billing (use test clocks)**
- [ ] Past the trial, `invoice.paid` adds one 10% line, held for 45 days, Paid Month 1. Re-sending the event (`stripe events resend`) adds nothing.
- [ ] After month 1, run the month close: a held bonus line appears, payable 45 days after the end of month 1.
- [ ] A failed month shows "Paused"; paying again carries on numbering. Nothing is earned after month 12.
- [ ] A first payment more than 60 days after sign-up: commission is earned, the bonus is "not eligible".
- [ ] A refund of the first payment reverses its commission and the bonus. A refund of a later month affects only that month.
- [ ] A test annual price (never published) gives one line covering 12 months. A 25% refund claws back 25%.
- [ ] A dispute (`4000000000000259`) holds the line; winning releases it, losing claws it back.
- [ ] Terms that cut the rate with under 30 days' notice are refused.

**Payouts**
- [ ] Under £10 carries forward. At £10 or more, the month close drafts a payout, and "Approve and send" makes a test Transfer (see Stripe test Dashboard → Connect). Clicking again doesn't pay twice.
- [ ] A clawback after a payout reduces the next one.
- [ ] Manual route: the payout becomes "manual pending", then "manual done" with a reference.
- [ ] A partner whose Stripe Account isn't ready is carried forward.
- [ ] End one partner normally and one for breach; check 11.2 and 11.3.
- [ ] Global Payouts with the flags off is refused with a clear message.

**Host flows unchanged**
- [ ] Guest extras, direct bookings and host subscription status still work.

## Open decisions (defaults in code)

| # | Decision | Default |
|---|---|---|
| D1 | Stripe platform profile (Stripe-liable, full dashboard partner accounts); UK→overseas Global Payouts | not confirmed (live accounts blocked) |
| D2 | Partners outside UK/EEA/US/CA/CH | waitlist; Global Payouts off |
| D3 | Who bears Stripe Connect fees (9.4) | OMS (never deducted); quarterly/fee-ratio blocked |
| D6 | Adding a code after set-up | never |
| D7 | Second business, same owner: own bonus? | no (owner identity) |
| D8 / D9 | Listing check / phone check | by hand / off |
| D10 | Hold Period | 45 days |
| D11 | Clawback method / write-off | offset only / never |
| D12 | Fraud thresholds | 5 in 24 h; 10% over 90 days |
| D13 | Hosts as partners | no |
| D14 / D15 / D16 | Bonus amount / tiers / end date | blank, so no bonus |
| D18 | Partial refund of first payment | bonus reversed in full |
| D20 | Strong identity match | auto-reject, admin can override |
| D21 | IP and device hash retention | 180 days |
| D22 | 11.2(b) | off |
| D23 | First-payment deadline for bonus | 60 days |
| D24 | Annual after monthly months | pro rata remaining |
| D25 | Resume after a gap post-stop | doesn't count |
| D26 | Refunded first payment replaced? | no |

## Where the build differs from the prompt, or notes a gap

- **Referrals waiting for review.** The prompt says commission is "null" when a referral isn't approved. Instead, a referral in review still gets its commission line, held `on_hold` until approved (8.5 allows holding). Approval releases it; rejection means nothing is paid. Otherwise every payment made before review would be lost for good.
- **Webhook busy answer.** While another delivery of the same event is still processing, the webhook answers 409 by returning a Response from `handlePartnerEvent`. The route block is three lines rather than the prompt's two.
- **One table added: `partner_charges`.** It links each referred payment to its referral, and records how much has been refunded and whether it's disputed. Stripe reports refunds as a running total, so this is what makes refunds idempotent.
- **Retry safety.** Clawback lines and clawback rows are unique per event. A refund that arrives before its `invoice.paid` is taken off when the invoice arrives. A payout whose lines changed after drafting is cancelled rather than sent at the old total. If Stripe refused a transfer, the next attempt uses a fresh idempotency key; after a timeout it reuses the same one.
- **Scheduled routines that start off.** `jobDue` used to ignore `startsOff` for scheduled routines. It's fixed, so `commission_close` doesn't run until it's switched on.
- **Privacy notice (`src/content/legal.ts`) not updated.** The programme collects hashed identity details plus IP and device hashes (kept 180 days), and sets a referral cookie (`TODO(legal)`: PECR consent). The wording, lawful basis and retention need the solicitor (agreement 8.5 note) before launch, and then `LEGAL_UPDATED` bumped.
- **Prorations.** Invoices that are only prorations never start a Paid Month (`TODO`: confirm whether Latchkey prorates).
- **11.3 "shown on a statement".** The code keeps ledger lines created before the stop date, whether or not a statement went out. If only issued statements count, the close needs to record when statements are issued.
- **Disputes before payment.** A dispute that arrives before its `invoice.paid` isn't matched (very unlikely).

## Going live (partner payouts)

Latchkey admin → Commission Partners shows the Stripe mode at the top (Test / Live / Off), why, and the steps left. Live can't be switched on from the app:

1. Stripe, live mode: finish the Connect platform profile the same way as in test, and add a live webhook endpoint with the events in step 3 above.
2. Lovable Cloud → Secrets: a live key (`STRIPE_LIVE_API_KEY` or `STRIPE_SECRET_KEY`) and `PARTNER_PAYOUTS_ALLOW_LIVE` = `true`.
3. Latchkey admin → Commission Partners → Programme decisions: tick "Stripe confirmed the platform profile (D1)".
4. Partners who set up payouts in test have a red "Stripe account from test mode" badge: type a reason and press **Reset Stripe account**. They then set up payouts again on their partner page. The test account stays in Stripe's test data.

## Agreement v1.0 on the website (migration 0062)

### New tables
| Table | What | Who can read |
|---|---|---|
| `partner_agreement_versions` | Each version's exact Markdown and its SHA-256; v1.0 seeded from the file. Published rows can't change (trigger); one `current`; a version that reduces terms needs `notice_sent_at` + 30 days. | Anyone (current and retired); super admins (drafts) |
| `partner_agreement_acceptances` | Clause 4.3 evidence: version, both hashes, terms row, typed name, ticks with their labels, time, raw IP, user agent, capacity, company details; refs to the signature PNG and signed PDF (Drive), `pdf_sha256`, `emailed_at`, `oms_confirmed_at/by`. Add-only. | The partner who signed; super admins |
| `partner_id_checks` | One row per attempt: status, details read (last 4 only), name match, flags, photo refs, `images_delete_after`, review, `retain_until`. | Super admins |
| `partner_id_access_log` | Every view of ID photos, with the reason. | Super admins |
| `drive_folders`, `drive_queue` | Drive folder ids; files waiting for Drive. | Server only |
| `partner_pending_disputes` | Disputes that arrived before their payment (10.4). | Super admins |

New columns: `partners.postal_address`, `self_billing_opt_out`, `stop_source`, `set_off_done_at`. Ledger kind `set_off`.

### Settings (Latchkey admin → Commission Partners → Programme decisions)
- **Join page takes applications** (`signupsOpen`, default off: "coming soon"; super admins preview at `/partners/join?preview=1`). This replaces the `PARTNER_SIGNUPS_OPEN` env flag Dev proposed, so it can be switched without a deploy.
- **Notice email** (`noticeEmail`): required before signing opens. Not hard-coded.
- **Launch date** (`launchDate`): "to be confirmed" until set.
- **Keep partner ID photos** (`idImagesStored`, default on).
- The "Agreement and signing" card says whether signing is open and why not (settings that differ from the published text, a missing notice email, no terms in force).
- Google Drive is the only store for ID photos and signed agreements (no Supabase copy), so Dev's `PARTNER_ID_DRIVE_UPLOAD` / `partnerIdDriveOnly` flags aren't needed.

### Partner journey
1. `/partners/join`: apply (when open).
2. `/partners/agreement`: read to the end, tick the 7 boxes, type full legal name, draw signature (company fields if for a company), sign. Email with a link to the signed copy.
3. `/partners/verify`: consent (wording from the prompt), ID photo, selfie. 2 automatic attempts, then manual review.
4. OMS: approve the ID check (Identity checks to review), then **Approve, confirm signature and activate** on the partner. The code works from then.
5. `/partners`: steps, signed copy (10-minute link), statement details (address, VAT number, self-billing opt-out), payouts, Stop.

### Jobs
- Daily privacy clean-up (`retention`): partner IP/device hashes after 180 days; partner ID photos 30 days after the decision; ID checks after `retain_until` (6 years after the stop); Drive queue sync; switches in a newly in-force agreement version. **It has never run on the live site** (see "Scheduler" below).
- `commission_close` is still off. It must be switched on (Latchkey admin → Routines) before the first payout: bonuses, hold release and payout drafting depend on it.

### Scheduler
`job_settings` shows `calendar_sync` never ran and there is no row for `retention`: nothing calls `/api/public/cron/latchkey`. Ask Lovable to schedule POSTs with the `LOVABLE_CRON_SECRET` bearer: `{"task":"sync"}` every 30 minutes, `{"task":"retention"}` daily, `{"task":"commission_close"}` daily once switched on. Until then, Latchkey admin → Routines → Run now.

### Clause map
| Clause | Where |
|---|---|
| 2.2, 8.2(b) calendar days, UK time | `withinDaysEnd`, `bonusEligibility` (commission.ts) |
| 3.4 identity check | partner-id.ts, partner-id.functions.ts, /partners/verify |
| 3.6 activation | partner-activation.ts; approvePartner; attachReferral, recordReferralClick |
| 4.1–4.4 e-signature and copy | partner-agreement.functions.ts, partner-pdf.server.ts, /partners/agreement |
| 6.2 codes at sign-up | `lateCodeAllowed` (before set-up saves its first property) |
| 7.3(c), 7.6 prorations | `paidAfterTrial` (commission.ts) |
| 8.2(f), 20.4(a) breach and bonus | `bonusEligibility`, `breachVoidedBonuses`, `voidBreachBonuses` |
| 10.3 partial QP refund | `applyClawback` with `bonusPartialRefund: "full"` |
| 10.4 disputes before payment | partner-webhook.ts `savePendingDispute` / `takePendingDispute` |
| 10.5, 10.6 clawback and set-off | negative payable lines in `planPayouts`; `applySetOff` |
| 12.1, 12.7, 13.1 statements | `statementCsv`, `partnerStatement` |
| 12.4(b) Stripe readiness | `canReceiveTransfers` |
| 17.1 retention | `purgePartnerHashes`, `purgePartnerIdImages` in the daily clean-up |
| 19.1, 19.4 versions | `publishAgreementVersion`, `switchVersions`, `activationMissing` "new_version" |
| 20.1, 21.2 stopping | `stopBeingPartner`; admin Stop Date in `setPartnerStatus` |
| 20.4(b) payouts after breach | `breachSetOffPending` in `planPayouts` and `sendPayout` |

### Changes to the agreement text (by the owner's instruction, before anyone signed)
- 4.4: "emails you a link to a PDF copy" (Lovable's email can't attach files) and "keeps that copy available to download in your Account".
- 17.1 table: signed PDF and drawn signature, and ID images, in restricted Google Drive folders (the queue described).
- 17.2: "OMS asks the service not to keep your images after the check, and OMS does not use your images to train AI models" (we can't promise what the provider does).
- 17.3: Google named for Drive storage of these files.
- Annex B explanation: "[the amount]" and "[the Bonus End Date]" instead of live placeholders.

### Agreement v1.2 and Launch Bonus rate campaigns (migration 0064)

- **Launch Bonus:** 20% instead of 10% for a referred host's first 12 Paid Months when the host's first payment after the trial (monthly or annual) is made from 27 October 2026 to 23:59 UK time on 31 December 2026. The rate is fixed on the referral at that payment and never changes (except upwards if the standard rate rises). Every other rule is unchanged.
- **Editable:** Latchkey admin → Commission Partners → Rate campaigns. Adding, raising and extending are allowed any time; withdrawing, lowering, starting later or ending sooner must take effect 30+ days from the save (clause 7.13), so email partners first. The agreement's Annex B and the join page update themselves.
- **Agreement v1.2:** new clauses 7.11 to 7.13, 7.1 / 7.7 / 7.10 / 19.2 updated, the one-off bonus renamed the Sign-up Bonus throughout. The contracting party still comes from Legal details (Omnistar Ltd). 0064 makes v1.2 current at once while nobody has signed; otherwise it's a draft effective 30 days later.

### Agreement v1.1 (migration 0063, in force; v1.0 retired before anyone signed)

- **Who runs Latchkey is no longer written into the text.** The header, clause 1.1, the "For OMS" line, Annex B and the footer use `{{operator.name}}` / `{{operator.details}}` from Latchkey admin → Site settings → Legal details (a person trading as OMS Estates, or later a company). New 1.5: when those details change, every copy is read with the new ones (the signed PDF stays the record of the text signed). 23.3: OMS may move the agreement into a company it owns or controls, agreed in advance, with the new owner taking on everything owed. "Omnispace" was removed from 14.5, 15.1 and 15.3. Signing stays closed until the legal name and address are filled in.
Drafted for OMS, with no solicitor or accountant engaged at this stage. Kept fair, so it stays enforceable against consumer partners (Consumer Rights Act 2015) and reasonable for business partners (UCTA 1977):
- 3.8 unfinished applications close after 60 days without ID verification.
- 12.1 statements are accepted unless queried within 60 days (except obvious error, fraud, or later recovery under clause 10).
- 12.4(e) payouts wait while requested tax forms or sanctions information is outstanding.
- 12.7(d), (e) self-billing invoice contents (HMRC Notice 700/62) and the partner's duty to tell OMS about VAT registration.
- 13.2 amounts don't increase if the partner becomes VAT-registered.
- 20.7 the final small balance is paid on request or 12 months after the Stop Date (no forfeiture: forfeiting earned money would risk being unfair).
- 23.9 OMS's records are evidence unless shown wrong; 23.10 concerns are raised with OMS first, with 30 days before court.

### Open decisions
1. US and Canadian partners on full-dashboard accounts (Stripe may refuse cross-border transfers): waitlist or not.
2. Launch Bonus amount, tiers, Bonus End Date: still none (a new `commission_terms` row).
3. Launch date and notice email: set before opening sign-ups.
4. Host price wording ("£1 for your first month" in the launch offer copy, `copy.ts` offer section). Not in any partner copy, the agreement or partner emails.
5. Switching on `commission_close`, and scheduling the routines.
6. Self-billing and VAT wording: done (statementCsv / vatTreatment). If OMS registers for VAT, add its VAT number in Site settings → Legal; it then shows on statements.
7. Whether the visitor-profile statistics and the `lk_ref`/`lk_dev` cookies need consent under PECR or fit the UK statistics exemption: for the solicitor.
8. Site settings → Legal is incomplete on the live site (company name "OMSEstates", no company number, address or ICO number): fill it in; the privacy policy and statements read it.

