/**
 * Keeping dashboards and door tablets on the newest published version.
 * Each checks /api/public/version every few minutes: a newer version shows a
 * small Update button by the version number. An update request (Latchkey
 * admin for every dashboard or every tablet, now or at a set time; a host
 * for their own tablets) makes the device reload by itself, but only once
 * nobody has used it for 15 minutes (and, on a tablet, no welcome or
 * goodbye is up and nobody is checking in). Pure; tested in
 * tests/app-update.test.ts.
 */

export const CHECK_MINUTES = 5;
export const IDLE_MINUTES = 15;
/** A scheduled update is announced on the dashboard from this long before. */
export const NOTICE_HOURS = 24;

export type Audience = "hosts" | "kiosks";
export type UpdateRequests = Record<Audience, string | null>;

const iso = (v: unknown) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;

export function normaliseUpdates(raw: unknown): UpdateRequests {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return { hosts: iso(r["hosts"]), kiosks: iso(r["kiosks"]) };
}

/** a > b for versions like "0.90.1". */
export function newerVersion(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/** An update was asked for after this page loaded, and its time has come. */
export function updateDue(
  requests: Array<string | null | undefined>,
  loadedAtMs: number,
  nowMs: number,
): boolean {
  return requests.some((r) => {
    const t = r ? Date.parse(r) : Number.NaN;
    return Number.isFinite(t) && t > loadedAtMs && t <= nowMs;
  });
}

/** Reload now? Only when due, nobody has touched it for 15 minutes, and nothing on screen needs it. */
export function shouldReload(o: { due: boolean; idleMs: number; busy: boolean }): boolean {
  return o.due && !o.busy && o.idleMs >= IDLE_MINUTES * 60_000;
}

/** The next scheduled update to tell people about (within NOTICE_HOURS), or null. */
export function upcomingUpdate(
  requests: Array<string | null | undefined>,
  nowMs: number,
): string | null {
  const next = requests
    .map((r) => (r ? Date.parse(r) : Number.NaN))
    .filter((t) => Number.isFinite(t) && t > nowMs && t - nowMs <= NOTICE_HOURS * 3_600_000)
    .sort((a, b) => a - b)[0];
  return next === undefined ? null : new Date(next).toISOString();
}
