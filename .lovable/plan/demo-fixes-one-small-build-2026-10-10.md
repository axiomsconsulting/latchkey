# Demo fixes — one small build

All changes are gated on the demo property (`is_demo = true`) or the shared demo account. Real properties keep the PIN, 3-tries lock and alerts unchanged.

## 1. Menu "Guest check-in" shows a PIN pad
- Root cause: `SiteMenu.tsx` links to `/checkin`, which is the real-guest PIN page.
- Change:
  - `src/components/SiteMenu.tsx`: link to `/p/$code` with `code: "tour"`, label `siteMenu.guest`.
  - `src/content/copy.ts`: `siteMenu.guest` → "Guest check-in demo"; add `guest.pinNote` = "For guests with a booking PIN from their host."
  - `src/routes/checkin.tsx`: render `copy.pinNote` under the PIN title.
- Risk: none.

## 2. /p/tour ends on "Let's pause for a moment"
- Root cause (confirmed in code): that screen is the `locked` step. `matchBooking` / `listArrivals` call `deviceLock()`, which locks after 3 failed tries on one device. Demo visitors don't know the demo guest's surname initial or check-out date, so they guess wrong 3 times, get locked for 10 minutes, and the host gets a lockout alert. A stale demo (seeded more than a day ago, so "today's" arrival has moved) makes this more likely. Not yet confirmed which of the two triggered your case; the fix covers both.
- Change:
  - `src/lib/checkin.functions.ts`: in `matchBooking`, `listArrivals` and `pickArrival`, if the property `is_demo`, skip `deviceLock`, skip the attempt insert and skip `raiseAlert` (this also covers the nice-to-have: no lockout alerts from demo visitors). Make sure `loadPropertyByCode` selects `is_demo`.
  - `src/lib/demo.functions.ts`: when seeding the guest demo, also rebuild if today's demo arrival is missing (not only after 24h).
  - `src/components/guest/CheckInFlow.tsx`: on a demo property, show a small hint card ("Demo: tap **B**, then check-out **Sun 12 Oct**") using the demo arrival's initial and date, returned by the existing property loader for demo properties only. ID step already falls back to self-declare; the done step already links to the stay guide and extras.
- Risk: low; every bypass checks `is_demo` on the server.

## 3. Demo session expires, /app/* goes to /auth
- Root cause (likely, unconfirmed): the shared demo account is signed in on many browsers; when its session cannot refresh, `src/routes/_authenticated/route.tsx` sends the visitor to `/auth`.
- Change:
  - `src/components/DemoPicker.tsx`: after the host demo signs in, set `localStorage["latchkey-demo"] = "1"`. Clear it in `auth.tsx` and in the "Start your free trial" button.
  - `src/routes/_authenticated/route.tsx`: if `getUser()` fails and that flag is set, call `startDemo({ as: "host" })`, then `verifyOtp`, and continue. If that fails, or there is no flag, send the visitor to `/auth` as before.
- Risk: low; it only re-signs in the demo account, and only for browsers that started the demo.

## One build?
Yes. That's about 7 small edits with no database change.
