# WhatsApp and texts to guests

Latchkey sends three kinds of guest messages through Latchkey's Twilio account:

- the **welcome** on the arrival day, at the time each property sets
- the **goodbye** on the check-out day, at its time
- the **check-in photo link** a guest asks for at the door tablet

Rules: `src/lib/guest-messages.ts`. Sending: `guest-messages.server.ts`, which runs with the calendar sync. Twilio calls: `guest-messaging.server.ts`.

Nothing is sent until both of these are on:

- the business's **guest messages** switch is live (Latchkey admin → Businesses)
- the **Welcome and goodbye messages to guests** routine is on (Latchkey admin → Routines)

## Who does what

| Task | Who |
|---|---|
| Twilio account, Meta business verification, Latchkey's shared WhatsApp number, message templates | Latchkey admin, once |
| Connecting a business's own WhatsApp number | Latchkey support, when the host asks |
| Turning messages on, words and times, text or WhatsApp, email too | The host, in Settings → Guests → Welcome and goodbye messages |

Hosts never deal with Twilio, Meta or templates.

## Latchkey admin: once

1. **Twilio.** Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` in Lovable Cloud → Secrets. `TWILIO_FROM` is a UK sender or a Messaging Service `MG…`. These are already used for host alerts.
2. **Meta.** Verify Latchkey's business in Meta Business Manager. You need company documents, the website, and an email on the domain.
3. **Shared WhatsApp number.** In Twilio: Messaging → Senders → WhatsApp senders → register a number Latchkey owns.
   - The number receives a code by text or call.
   - It can't be in use on the WhatsApp app at the same time.
   - Put it in Latchkey admin → Integrations → WhatsApp for guests, or in the secret `TWILIO_WHATSAPP_FROM`.
4. **Templates.** In Twilio's Content template builder, make three templates, each with category **Utility**, and submit them for WhatsApp approval:
   - `welcome`: for example "Hi {{1}}, welcome to {{2}}! Your stay guide with Wi-Fi, getting in and everything else: {{3}}". Add a media header if hosts should be able to attach a PDF or photo.
   - `goodbye`: for example "Thank you for staying at {{2}}, {{1}}. Safe travels, and you can book direct next time: {{3}}".
   - `photo_link`: for example "{{1}}: take your check-in photos on your phone here {{2}}".

   Paste each approved `HX…` id into Latchkey admin → Integrations → WhatsApp for guests. A message without its template goes by text instead.
5. **Go live.** Switch each business's guest messages to live when they're ready.

Why templates: WhatsApp only lets a business message someone first with wording Meta has approved. A host's own words go by text and email. On WhatsApp the guest gets the approved wording, filled in with their name, the property and the link.

## A business's own WhatsApp number

The host asks from Settings → Guests → WhatsApp → Use our own WhatsApp number. The request appears in Latchkey admin → Feedback. Support then:

1. Registers the number as a WhatsApp sender in Twilio, under Latchkey's account. The host receives a code by text or call and confirms their business with Meta once.
2. Enters the number in Latchkey admin → Businesses (with that business opened) → This business's own WhatsApp number → Make it live.

From then on, that business's messages come from its own number.

### One-click set-up for hosts (later)

This works like Stripe Connect: the host clicks "Connect WhatsApp", signs in to Facebook, picks or creates their WhatsApp Business account, verifies their number, and is done. It's Meta's **Embedded Signup**. Latchkey must first:

1. Join **Twilio's Tech Provider programme** (ISV). Twilio then registers senders for businesses through its Senders API, in a subaccount per business.
2. Create a **Meta app** with WhatsApp and Facebook Login for Business, and an Embedded Signup configuration (its configuration id). Meta reviews the app.
3. Add the app id and configuration id to Latchkey admin.

The rest is code:

- the Connect button runs the Facebook SDK with that configuration
- the server registers the returned WhatsApp Business account and number with Twilio
- the sender becomes live when Twilio reports it as online

This isn't built yet because it can't be tested without the Tech Provider approval. Ask for it once Latchkey is approved.

## Attachments

- **WhatsApp:** a welcome can carry one PDF or photo, chosen from the files attached to the property's guide sections. It's sent as a six-hour signed link that Twilio fetches. This needs a welcome template with a media header.
- **Email:** the attachment is included as that link.
- **Text:** UK texts can't carry files (MMS is US and Canada only), so texts never have one.

## Costs and length

- A UK text costs a few pence per 160-character part.
- Emoji or curly quotes cut a part to 70 characters. The settings card shows the length with the links filled in.
- WhatsApp utility messages are charged per message by Meta, plus Twilio's fee.
