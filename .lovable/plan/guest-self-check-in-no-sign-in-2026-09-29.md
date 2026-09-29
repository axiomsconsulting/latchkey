# Guest self check-in (no sign-in)

## What guests see
Ways in: the front-door tablet (kiosk mode), a printable QR code for each property, a short link (`/p/trinity`), or typing the 6-digit property PIN at `/checkin`.

1. Welcome: "Welcome to The Trinity Rooms. Let's get you checked in."
2. First letter of their surname (A–Z grid).
3. Check-out day (7 big day buttons).
4. The platform they booked on.
   - They continue only if exactly one booking arriving today or yesterday matches. After 3 misses, that device is locked for 10 minutes and the host is told.
   - If ID checks are turned off, the guest instead picks their stay from a short list showing only first name + initial and dates.
5. "Hi Priya" (first name only). The guest confirms it's them.
6. Identity check. The host chooses which methods are on and which comes first. If a method fails, it falls back through them in order:
   - **Photo ID** (first by default). Consent text, then the camera. The AI reads the name and compares it with the booking, allowing for middle names and upper/lower case. Result: matched, partial or not matched. The photo is never saved.
   - **Last 4 digits.** Whichever the booking has: booking reference, phone or email. These come from the calendar link or the host fills them in.
   - **Self-declaration.** The guest ticks "I confirm I'm the guest on this booking" and sees a friendly note: "Thank you. Your host will say hello and check your ID in person during your stay."
   - Fallback happens automatically if the camera won't start or after 2 failed photo attempts.
   - A mismatch, partial match or self-declaration lets the guest carry on, but flags the booking for the host.
7. "You're in Room 1, The Trinity — Suite 1" and a "Your stay guide" button.
   - The booking is marked checked in, and an "arrived" entry is logged.

**Basic stay page:** a private link for that stay only. It shows the room, Wi-Fi, check-out time, quiet hours, parking and host contact. The link stops working after check-out.

**Kiosk mode** (`/kiosk/trinity`): full screen, and goes back to the welcome screen after 60 seconds without a tap. To exit, hold the top corner for 3 seconds, then enter the door PIN.

## What the host sees
- **Properties → Check-in settings:**
  - Turn each method on or off: photo ID, last-4 reference / phone / email, self-declaration.
  - Pick which method comes first.
  - Add the guest's email to a booking if needed.
- **Properties → Print QR code:** a printable A5 card with the QR code, short link and PIN.
- **Today:** red alerts for lockouts, ID mismatches and self-declared check-ins, plus a count on the menu.
- **Email:** the same alerts by email. You'll need to set up a sender address first. I'll show a setup step during the build.

## Privacy (UK GDPR)
- Nothing on the public pages reveals a guest's name until all three answers match.
- Only first names are ever shown.
- ID photos are never stored.
- Check results keep only the method, result and time. They're deleted 30 days after check-out.
- Failed attempts are stored with a scrambled device code, not the IP address. They're deleted after 30 days.

## Technical details
- Migration:
  - `properties.checkin_methods jsonb` (order + enabled).
  - `bookings.guest_email_last4`, `bookings.id_check_flag`.
  - `stay_tokens` table: hashed token, booking_id, expires_at.
  - `host_alerts` table.
  - `device_lockouts` table (device hash, until).
  - All tables get grants and RLS. Staff can read alerts; guests have no direct table access.
- Public server functions in `src/lib/checkin.functions.ts`:
  - resolvePropertyByCode/PIN, matchBooking, confirmBooking, verifyLast4, verifyPhotoId, selfDeclare, completeCheckIn, getStay.
  - Each validates its input with zod and uses the admin client only after checks pass.
  - A signed short-lived check-in session token links the steps together.
- Photo ID: the image is sent in memory to Lovable AI (default model) as a structured "extract full name" request. A tested pure function `compareNames` (in `src/lib/name-match.ts`) scores the result.
- Lockout: a random device id (localStorage) plus a salted hash; 3 failures within 10 minutes locks the device.
- Email: set up transactional email templates; sent from the server when an alert is created.
- Retention added to the existing cron sweep.
- Tests: name matching, booking matching (letter/day/platform, today/yesterday window, exactly one match), lockout timing, method fallback order.
- Routes: `/checkin`, `/p/$code` (replaces the demo page), `/kiosk/$code`, `/stay/$token`, plus a print view under the host app.
- All wording goes in `copy.ts` under `guest`. Buttons for guests are h-16 or larger, built tablet landscape first.
