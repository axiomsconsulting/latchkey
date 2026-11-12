import { branded } from "@/lib/brand";
/**
 * Every routine that spends Lovable Run credits: scheduled jobs (woken by
 * Lovable's scheduler through /api/public/cron/latchkey) and features that
 * run when people use them. The super admin switches each on or off and,
 * for scheduled ones, sets how often they may actually run. Pure.
 */

export type JobKind = "scheduled" | "on_use";

export type Job = {
  key: string;
  name: string;
  kind: JobKind;
  what: string;
  /** How often Lovable's scheduler wakes it, for scheduled jobs. */
  wakes?: string;
  /** Default minimum minutes between real runs (scheduled jobs). */
  defaultEvery?: number;
  /** The usage counter that measures it. */
  metric: string;
  /** Can the super admin run it now? */
  runnable: boolean;
  /** Experimental: off until the super admin switches it on. */
  startsOff?: boolean;
};

export const JOBS: Job[] = branded([
  {
    key: "calendar_sync",
    name: "Calendar sync",
    kind: "scheduled",
    what: "Reads every connected booking calendar and updates stays.",
    wakes: "Every 30 minutes",
    defaultEvery: 30,
    metric: "job:calendar_sync",
    runnable: true,
  },
  {
    key: "retention",
    name: "Privacy clean-up",
    kind: "scheduled",
    what: "Clears guest details and messages when each business chose (90 days unless changed), removes ID records, register entries and old check-in data when they're due.",
    wakes: "Daily",
    defaultEvery: 1440,
    metric: "job:retention",
    runnable: true,
  },
  {
    key: "commission_close",
    name: "Commission Partner month close",
    kind: "scheduled",
    what: "Checks Sign-up Bonuses, releases commission after its hold, re-runs fraud checks, clears old IP hashes and drafts Commission Partner payouts for approval. Nothing is ever sent without Latchkey admin's approval.",
    wakes: "Daily",
    defaultEvery: 1440,
    metric: "job:commission_close",
    runnable: true,
    startsOff: true,
  },
  {
    key: "ai_id_reading",
    name: "AI photo ID reading",
    kind: "on_use",
    what: "Reads guests' ID photos at check-in. Off: guests confirm with booking details instead.",
    metric: "ai:id_read",
    runnable: false,
  },
  {
    key: "ai_photos",
    name: "AI photo sorting",
    kind: "on_use",
    what: "Sorts a room's photos into spaces (bedroom, bathroom, kitchen…) for the booking page, for businesses with the AI photo sorting feature and a two-room trial for the rest. Off: hosts pick each photo's space themselves.",
    metric: "ai:photo_sort",
    runnable: false,
  },
  {
    key: "ai_trades",
    name: "AI trade suggestions",
    kind: "on_use",
    what: "Suggests which trades a host will need. Off: hosts add contacts themselves.",
    metric: "ai:trades",
    runnable: false,
  },
  {
    key: "email_alerts",
    name: "Email alerts to hosts",
    kind: "on_use",
    what: "Emails hosts about lockouts, ID checks and requests. Off: alerts still show on Today.",
    metric: "email:alert",
    runnable: false,
  },
  {
    key: "demo_tour",
    name: "Public demo",
    kind: "on_use",
    what: "Rebuilds every public demo property (The Hill Suites and the Texas, Mayfair, Paris and Tokyo demos) once a day when visitors open them. Off: the demos show as unavailable.",
    metric: "job:demo_rebuild",
    runnable: true,
  },
  {
    key: "push_alerts",
    name: "Push alerts to hosts' devices",
    kind: "on_use",
    what: "Free Web Push to phones, tablets and computers that turned on alerts. Off: alerts still show on Today and go by email.",
    metric: "push:sent",
    runnable: false,
  },
  {
    key: "telegram_alerts",
    name: "Telegram alerts to hosts",
    kind: "on_use",
    what: "Free messages from the Latchkey bot to hosts who linked Telegram. Off: nothing is sent to Telegram.",
    metric: "telegram:sent",
    runnable: false,
  },
  {
    key: "guest_messages",
    name: "Welcome and goodbye messages to guests (paid per message)",
    kind: "on_use",
    what: "Hosts' welcome and goodbye texts, WhatsApp messages and emails to guests, checked with every calendar sync. Texts and WhatsApp messages cost a few pence each through Twilio. Off: none are sent.",
    metric: "sms:guest",
    runnable: false,
  },
  {
    key: "sms_alerts",
    name: "SMS alerts to hosts (paid per text)",
    kind: "on_use",
    what: "Text messages through Twilio, urgent alerts only unless a host asks for all. Each text costs about 4p. Off: no texts are sent.",
    metric: "sms:sent",
    runnable: false,
  },
  {
    key: "whatsapp_alerts",
    name: "WhatsApp alerts to hosts (paid per message)",
    kind: "on_use",
    what: "WhatsApp messages to hosts through Twilio and Latchkey's number, using the approved host alert template. Urgent alerts only unless a host asks for all. Each costs a few pence.",
    metric: "whatsapp:alert",
    runnable: false,
  },
  {
    key: "inbound_email",
    name: "Booking-site messages by email",
    kind: "on_use",
    what: "Reads Airbnb, Booking.com and other emails hosts forward, and adds the guest's message to their conversation. Off: forwarded emails are ignored.",
    metric: "inbound:email",
    runnable: false,
  },
  {
    key: "visitor_analytics",
    name: "Visitor analytics",
    kind: "on_use",
    what: "Records the pages people visit and links visitors to their account when they sign in. Off: nothing new is recorded.",
    metric: "analytics:visit",
    runnable: false,
  },
  {
    key: "api",
    name: "API and MCP server",
    kind: "on_use",
    what: "Answers hosts' API and AI-assistant requests. Off: every request is refused for now.",
    metric: "api:request",
    runnable: false,
  },
  {
    key: "listing_import",
    name: "Listing import with Firecrawl (experimental)",
    kind: "on_use",
    what: "Reads hosts' own public listing pages on Airbnb, Booking.com, Vrbo, Agoda and Homestay through Firecrawl (FIRECRAWL_API_KEY, paid per page) so they can add their property, rooms and photos. Off: the import button doesn't show.",
    metric: "firecrawl:scrape",
    runnable: false,
    startsOff: true,
  },
  {
    key: "bank_feeds",
    name: "Bank transfers received",
    kind: "on_use",
    what: "With every calendar sync, reads the bank accounts hosts connected (Starling, free) for money in while a direct booking waits for a transfer, and marks it paid when the reference and amount match. Off: hosts upload a statement or mark payments themselves.",
    metric: "job:bank_feeds",
    runnable: false,
  },
  {
    key: "rate_watch",
    name: "Smart pricing: reading prices on booking sites with Firecrawl",
    kind: "on_use",
    what: "Reads the price guests see on hosts' own listings and the other properties they chose, for a few sample stays, on each host's schedule (checked with the calendar sync) or when they tap Check prices now (FIRECRAWL_API_KEY, paid per page, up to 24 pages a read). Off: suggestions use the prices already read.",
    metric: "firecrawl:prices",
    runnable: false,
    startsOff: true,
  },
  {
    key: "ai_floor_plans",
    name: "AI floor plan reading",
    kind: "on_use",
    what: "When a host taps Read the plan for me, reads the floor plan picture and proposes its rooms, hallways, landings, stairs, doors and entrance for the host to check. Off: hosts draw them themselves.",
    metric: "ai:floor_plan",
    runnable: false,
    startsOff: true,
  },
  {
    key: "ai_receptionist",
    name: "AI receptionist (Pro)",
    kind: "on_use",
    what: "Answers guests' questions by text or voice on the door tablets hosts choose and on guests' phones, from the host's guide, property information, around here and floor plans; spoken answers use the studio voice through ElevenLabs. Only for Pro businesses whose host turned it on. Off: it doesn't appear anywhere.",
    metric: "ai:receptionist",
    runnable: false,
    startsOff: true,
  },
  {
    key: "voice_ai",
    name: "Voice check-in: understanding unclear replies",
    kind: "on_use",
    what: "When a guest checking in by voice says something the door tablet's rules don't recognise, AI works out which answer they meant (a short text request; no audio is sent). Off: the concierge just asks them to say it again.",
    metric: "ai:voice_intent",
    runnable: false,
  },
  {
    key: "review_import",
    name: "Reviews for door tablets with Firecrawl",
    kind: "on_use",
    what: "Reads the reviews on hosts' own listing pages through Firecrawl (FIRECRAWL_API_KEY, paid per page) when a host taps Fetch reviews, so the door tablet can show their best ones while an ID is checked. Off: the button says reviews can't be fetched yet.",
    metric: "firecrawl:reviews",
    runnable: false,
    startsOff: true,
  },
]);

export type JobSetting = {
  key: string;
  enabled: boolean;
  every_minutes: number | null;
  last_run_at: string | null;
};

/** Whether a scheduled job should run now, given its switch and last run. */
export function jobDue(job: Job, s: JobSetting | undefined, now: Date = new Date()): boolean {
  if (s && !s.enabled) return false;
  if (job.kind !== "scheduled") return s ? s.enabled : !job.startsOff;
  // A scheduled routine that starts off waits for the super admin's switch.
  if (!s && job.startsOff) return false;
  const every = s?.every_minutes ?? job.defaultEvery ?? 0;
  if (!s?.last_run_at) return true;
  // A minute's grace so a run every 30 minutes isn't skipped by a few seconds.
  return now.getTime() - Date.parse(s.last_run_at) >= (every - 1) * 60_000;
}
