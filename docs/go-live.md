# Going live: app, email, alerts and booking-site messages

Everything below is already built into Latchkey. These are the one-time
steps that need your accounts, DNS or keys. Do them in this order; each one
works on its own, so you can stop at any point.

Where things live:

- **Lovable Cloud → Secrets**: every key (never paste keys into the app).
- **Latchkey admin → Integrations** (super admin): what's set up, one-click
  helpers (make push keys, connect Telegram, test SMS, inbound address).
- **Latchkey admin → Routines**: switch any channel off at any time.
- **Settings → App and alerts / Airbnb and Booking.com messages** (each host):
  their own choices: which channels, this device, Telegram, forwarding.

---

## 1. Email sending (free) — do this first

Receipts, host alerts and team invites are coded; they need your domain
verified with Lovable's managed email.

1. In Lovable: **Cloud → Emails** (or the email domain screen). Copy the
   exact records it shows. They look like:
   - `TXT` `_lovable-email.latchkey.omsestates.uk` →
     `lovable_email_verify=8b3508a7…`
   - `NS` records pointing a **sending subdomain** (e.g.
     `notify.latchkey.omsestates.uk`) to `ns5.lovable.cloud` and
     `ns6.lovable.cloud`.
2. At your DNS provider for `omsestates.uk`, add them exactly as shown.
   ⚠️ The NS records must be on the sending subdomain only. Never put NS
   records on `omsestates.uk` or `latchkey.omsestates.uk` themselves: that
   would hand your whole site's DNS to someone else and take it offline.
3. Wait for Lovable to show the domain as verified (minutes to a few hours).
4. For each business that should get email alerts: Settings → integration
   switches → set **host email** to **live**. Then Settings → App and
   alerts → **Send a test alert**.

Later, if you outgrow it: Resend (3,000 free emails a month) can replace the
sender without changing anything else.

## 2. Install as an app (free) — nothing to set up

Latchkey is now an installable app (PWA): manifest, icons, offline shell and
"Reconnecting…" page for patchy Wi-Fi, and push alerts.

- **Hosts:** Settings → App and alerts → **Install the Latchkey app**
  (Chrome/Edge/Android: one tap; iPhone/iPad: Share → Add to Home Screen).
- **Front-door tablet:** open the kiosk, hold the corner to open the exit
  dialog, tap **Install the kiosk on this tablet**. It installs as its own
  app that opens straight onto that property's check-in, full screen and
  landscape. On iPad, also turn on **Guided Access** (Settings →
  Accessibility) so guests can't leave the kiosk.
- App icons come from `public/Omnispace Favicon OMS.png`. To change them,
  replace that file and regenerate `public/icons/` (see the commit that added
  them for the `sips` commands), or ask Lovable to.

### Optional: Google Play and the App Store

1. Go to **pwabuilder.com**, enter your live Latchkey address, and package.
2. **Google Play** (one-off $25 developer fee): download the Android package
   (Trusted Web Activity). PWABuilder gives you an `assetlinks.json`: add it
   to the repo as `public/.well-known/assetlinks.json` (ask Lovable to commit
   it) so the app opens without a browser bar. Upload the `.aab` in Play
   Console.
3. **Apple App Store** ($99/year): download the iOS project, open in Xcode on
   a Mac, set your team, archive and submit through App Store Connect. Apple
   is stricter about "website in a wrapper" apps; the kiosk and push alerts
   help, but expect review questions.
4. Need native features later (Bluetooth locks, NFC)? Export to GitHub and
   wrap with **Capacitor** (free, open source).

## 3. Push alerts (free)

1. Latchkey admin → Integrations → Push alerts → **Make a key pair**.
2. Lovable Cloud → Secrets: add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
   with those values (and optionally `VAPID_SUBJECT` = `mailto:you@yourdomain`).
   Keep them: changing them later means hosts turn alerts on again.
3. Hosts: Settings → App and alerts → Alerts on this device → **Turn on
   here**. iPhone/iPad need Latchkey installed to the home screen first
   (iOS 16.4+).

## 4. Telegram alerts (free)

1. In Telegram, message **@BotFather** → `/newbot` → name it (e.g. *Latchkey
   Alerts*) → copy the token.
2. Lovable Cloud → Secrets: `TELEGRAM_BOT_TOKEN`.
3. Latchkey admin → Integrations → Telegram → **Connect webhook**.
4. Hosts: Settings → App and alerts → Telegram → **Connect Telegram** → Start.

## 5. SMS alerts (pay as you go, ~4p a UK text)

1. Create a Twilio account, top up £10, buy a UK number (or create a
   Messaging Service).
2. Lovable Cloud → Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_FROM` (the number in +44 form, an alphanumeric sender name where
   allowed, or the `MG…` Messaging Service id).
3. Latchkey admin → Integrations → SMS → **Send a test text**.
4. Hosts: add their mobile (with country) in Settings, then switch on texts.
   By default only urgent alerts go by text. Each text is counted in
   Latchkey admin → Routines (`sms:sent`); switch SMS off there any time.

WhatsApp through Twilio needs Meta-approved message templates for alerts
Latchkey starts; it can be added on the same code path once templates are
approved.

## 6. Airbnb and Booking.com messages by email (free)

Neither platform gives independent hosts a messaging API, but both email
every guest message. Hosts forward those emails to Latchkey; each message
lands in that guest's conversation, next to their requests and payments.

1. Create a free **Postmark** account → a Server → **Inbound** stream.
   Postmark gives an address like `abc123@inbound.postmarkapp.com`.
2. Lovable Cloud → Secrets: `INBOUND_EMAIL_SECRET` = any long random text.
3. In Postmark's inbound settings, set the **webhook URL** to
   `https://<your-site>/api/public/inbound-email/<INBOUND_EMAIL_SECRET>`.
4. Latchkey admin → Integrations → Booking-site messages: set the pattern to
   `abc123+{code}@inbound.postmarkapp.com` (your Postmark address with
   `+{code}` before the @). Save.
5. Hosts: Settings → Airbnb and Booking.com messages → **Create my
   forwarding address**, then follow the Gmail/Outlook steps shown there.
   Gmail's confirmation code appears right in that panel.

Replies: in the conversation, **Reply by email** opens the host's own email
with the platform's reply address, so the guest gets it on Airbnb or
Booking.com (platforms only accept replies from the host's own mailbox).

Prefer Cloudflare? If your DNS is on Cloudflare, use Email Routing with the
worker in `docs/inbound-email-worker.js` instead of Postmark.

When to pay for an aggregator (Hospitable, Uplisting, Hostaway, about
£20–40/month): when hosts want real-time two-way chat inside Latchkey
without email, usually once you have dozens of paying hosts.

## 7. In-house messaging (already live)

The guest's stay link (`/stay/…`) and in-room QR guides (`/room/…`) are the
recorded conversation Latchkey owns: messages, extras, charges and requests
with the stay. Every new guest message now also reaches hosts by push,
Telegram, email or text as they've chosen.

## White label and hosts' own web addresses

- **Brand:** Latchkey admin → Site settings → Brand. The product name you set replaces "Latchkey" on every page, email, alert, the installed app's name and the API docs, within a minute. Needs migration 0038.
- **A host's own address** (e.g. `stay.hillsuites.co.uk`):
  1. The owner adds it in Settings → Your own web address and adds the two DNS records shown (a CNAME to this app's address, and a TXT record that proves it's theirs), then taps Check.
  2. Once it shows as proved in Latchkey admin → Site settings → Hosts' own web addresses, add the same address to the hosting: in Lovable, Project settings → Domains → Connect domain. Wait until the hosting shows it as active (it issues the HTTPS certificate).
  3. Switch it Live in Latchkey admin. From then on, guests there see the host's name on every page, and the address's home page opens the host's property (the platform's home, pricing and trial pages aren't shown there).
