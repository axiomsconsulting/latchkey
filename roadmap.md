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
- [ ] A: "Local taxis" guide section
- [ ] B: room schedule extension + cleaning-gap warning; expire unpaid after 2h (cron)
- [ ] C: Stripe payments (needs user to confirm the Stripe form), bank transfer screenshot
- [ ] D: live messaging, chips, urgent maintenance, do not disturb
- [ ] E: who's in card, automatic reminders, 30-day message deletion
