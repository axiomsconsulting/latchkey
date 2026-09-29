# Roadmap

## Guest self check-in (done)
- [x] Schema, logic + tests, server functions, guest screens, host settings, QR card
- [ ] Email alerts (needs sender email domain)

## Contra services, theming, iOS menu (in progress)
- [x] Schema: theme_config, integration modes per host, service_jobs, branding storage
- [x] Demo / live switch per integration (Contra, ID reading, host email, guest ETA messages)
- [x] Provider recommendation logic + tests (rating, price, availability)
- [x] Guest stay page: report issue / order extras, see ETA + messages
- [x] Host Services hub: inbox, approve, recommend, appoint, scheduled maintenance, provider directory
- [x] Theme studio: presets, colours, fonts (preset + upload), logo presets + upload, live preview
- [x] Themed guest pages + host dashboard; vanity link /trinity with Host portal link
- [x] iOS-style floating glass navigation
- [ ] Live Contra mode: needs Contra API key/endpoint from the user

## Stay guides (done)
- [x] House sections + room overrides, block editor with photos, basic/detailed per room
- [x] Private guide link: arrival day to check-out; forget card; starter text

## Requests, extras & messaging (plan approved)
- [x] A: price list per property (demo defaults), luggage sizes, tax + bank + "out until" settings
- [x] A: guide link opens 48h early, door details from arrival-day midnight, read-only 24h after check-out
- [x] B: guest basket, time windows, late/early hours only when free, auto-approve, host approve/decline/suggest
- [x] Extras cart: dismissable basket, free + paid items, £0 flow without Stripe, bank/cash fallback, itemised receipt
- [x] Guest/host messaging: stay-page inbox, host bell + unread badges, read receipts
- [x] Check-in QR handoff: resume token, QR switches to stay link, desktop card + mobile icon
- [x] Trades address book: manual add, CSV import with mapping preview, one-tap call/text/WhatsApp/email, AI trade suggestions, regional address fields (country per property)
- [x] Directory search per property postcode/country; Contra repositioned as "Grow your listing"
- [ ] A: "Local taxis" guide section
- [ ] B: room schedule extension + cleaning-gap warning; expire unpaid after 2h (cron)
- [ ] C: Stripe live webhook (STRIPE_WEBHOOK_SECRET) — test payments work; live key on request
- [ ] D: live messaging delivery (outbound email/SMS) — needs sender domain
- [ ] E: who's in card, automatic reminders, 30-day message deletion
- [ ] Live Contra mode: needs Contra API key/endpoint from the user
