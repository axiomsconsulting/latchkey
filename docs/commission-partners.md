# Commission Partner payouts: status, set-up and test checklist

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
