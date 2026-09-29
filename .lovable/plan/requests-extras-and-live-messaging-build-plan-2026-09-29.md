# Requests, extras and live messaging — build plan

Built in five stages, each usable on its own. Your answers (1-25) are the rules throughout.

## Stage A — Price list and settings
- One price list per property, preloaded with your demo list (breakfast off, cycle hire and paid taxi removed). Each item: name, price, unit, max per request, free/paid, auto-approve, on/off.
- Luggage storage with bag sizes (small / medium / large) priced per bag per day.
- Tax settings per host: VAT/GST/sales-tax name, rate (default 20%), "prices include tax", off by default. Currency per host.
- "Local taxis" section added to the guide.
- Guide link now opens 48 hours before arrival; door and lock details stay hidden until midnight on arrival day; everything stays open until 24 hours after check-out, then read-only.

## Stage B — Guest requests and host inbox
- "Request extras" from the guide: basket, quantities, time windows (As soon as possible with "Host out until 18:00", This evening, Tomorrow morning, Leave outside my door). Only times that avoid quiet hours and unavailable windows.
- Late check-out / early check-in only offer hours that are genuinely free for that room.
- One host inbox for extras, cleaning and repairs: Approve, Decline, Suggest another time (held 2 hours). Auto-approve rules applied instantly.
- Room schedule shows confirmed late check-out / early check-in as a longer stay, with a warning if cleaning drops under 2 hours.

## Stage C — Payments
- Built-in Stripe payments, test mode in Demo (real test card 4242…), host's own claimed account in Live. One payment per request, "time left to pay" shown, unpaid requests released after 2 hours, automatic refunds on cancellation.
- Bank transfer option: host shows their bank details; guest uploads a payment screenshot; host taps "Payment received" before it's confirmed.
- Confirmation message: "You're booked: late check-out until 12:00".

## Stage D — Live messaging
- Private thread per booking that updates instantly, on the guest's own phone only (not the door tablet).
- Guest and host quick-message chips as large buttons, with value pickers (e.g. "On my way" 10/20/30 min, cleaning times).
- Free-item chips create request cards with live status; repeats within 12 hours join the existing request; loan items get a "leave in the room" note.
- Urgent maintenance: short description + one photo, red for the host, instant alert, safety line for the guest, co-host alerted after 15 minutes.
- "Hot water isn't working" replies with the room's hot-water step and a "Still not working" button.
- Do not disturb moon badge and "Available again".
- Host list: urgent first, then unread, then latest. Unread badge on the tab.

## Stage E — Who's in and reminders
- Dashboard card: In now, Out (since 09:40), Checked out today. Cleaners see occupied/empty only.
- Automatic reminders: arrival day 09:00, first evening 20:00, evening before check-out 19:00 (with "Request late check-out" button), check-out morning 08:00, 1 hour before unavailable windows. Held back during quiet hours. Each can be switched off and reworded per property.
- Messages and photos deleted 30 days after check-out.

## What's needed from you
- Stripe: I'll switch on built-in payments at Stage C; you'll see a short form to confirm.
- Email alerts still need a sender email domain; Settings will show "Email alerts not set up" with a setup link.

## Technical details
- New tables: extras price list (replaces the unused extras catalogue, which is marked deprecated), request items, payments extended for Stripe/bank transfer, message attachments and flags, reminder settings and queue. RLS on all; guest access only via stay-token server functions.
- Existing `requests`, `messages`, `payments`, `presence_log` reused; service_jobs stays the single work inbox.
- Realtime: guest pages subscribe via a token-scoped channel; host via authenticated realtime on `messages`.
- Reminder sending runs in the existing cron endpoint.
- Pure, tested logic for pricing/tax, available late check-out hours, time windows, reminder scheduling and dedupe.
- Private storage bucket for message photos and payment screenshots, signed links only.
