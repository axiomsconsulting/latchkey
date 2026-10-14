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
};

export const JOBS: Job[] = [
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
    what: "Clears guest names after 90 days, removes ID records, register entries and old check-in data when they're due.",
    wakes: "Daily",
    defaultEvery: 1440,
    metric: "job:retention",
    runnable: true,
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
    what: "Rebuilds the shared demo once a day when visitors open it. Off: the demo shows as unavailable.",
    metric: "job:demo_rebuild",
    runnable: true,
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
];

export type JobSetting = { key: string; enabled: boolean; every_minutes: number | null; last_run_at: string | null };

/** Whether a scheduled job should run now, given its switch and last run. */
export function jobDue(job: Job, s: JobSetting | undefined, now: Date = new Date()): boolean {
  if (s && !s.enabled) return false;
  if (job.kind !== "scheduled") return s ? s.enabled : true;
  const every = s?.every_minutes ?? job.defaultEvery ?? 0;
  if (!s?.last_run_at) return true;
  // A minute's grace so a run every 30 minutes isn't skipped by a few seconds.
  return now.getTime() - Date.parse(s.last_run_at) >= (every - 1) * 60_000;
}
