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

export const CHECK_MINUTES = 2;
export const IDLE_MINUTES = 15;
/** A scheduled update is announced on the dashboard from this long before. */
export const NOTICE_HOURS = 24;

export type Audience = "hosts" | "kiosks";
/**
 * How a device updates once its time comes: "now" reloads straight away
 * (within a minute or two of being asked); "idle" waits until nobody has
 * used it for 15 minutes and nothing on it is busy. A scheduled update is a
 * request with a future time.
 */
export type UpdateMode = "now" | "idle";
export type UpdateRequest = { at: string; mode: UpdateMode };
export type UpdateRequests = Record<Audience, UpdateRequest | null>;

const iso = (v: unknown) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;

/** A stored request: { at, mode }, or an older plain time (which waited for idle). */
export function readRequest(v: unknown): UpdateRequest | null {
  if (typeof v === "string") {
    const at = iso(v);
    return at ? { at, mode: "idle" } : null;
  }
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    const at = iso(r["at"]);
    return at ? { at, mode: r["mode"] === "now" ? "now" : "idle" } : null;
  }
  return null;
}

export function normaliseUpdates(raw: unknown): UpdateRequests {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return { hosts: readRequest(r["hosts"]), kiosks: readRequest(r["kiosks"]) };
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

/**
 * An update asked for after this page loaded whose time has come: "now" if
 * any such request says now, else "idle", else null.
 */
export function updateDue(
  requests: Array<UpdateRequest | null | undefined>,
  loadedAtMs: number,
  nowMs: number,
): UpdateMode | null {
  const due = requests.filter((r): r is UpdateRequest => {
    const t = r ? Date.parse(r.at) : Number.NaN;
    return Number.isFinite(t) && t > loadedAtMs && t <= nowMs;
  });
  if (!due.length) return null;
  return due.some((r) => r.mode === "now") ? "now" : "idle";
}

/** Reload now? "now" at once; "idle" only once nobody has touched it for 15 minutes and nothing on it is busy. */
export function shouldReload(o: {
  due: UpdateMode | null;
  idleMs: number;
  busy: boolean;
}): boolean {
  if (o.due === "now") return true;
  return o.due === "idle" && !o.busy && o.idleMs >= IDLE_MINUTES * 60_000;
}

/** The next scheduled update to tell people about (within NOTICE_HOURS), or null. */
export function upcomingUpdate(
  requests: Array<UpdateRequest | null | undefined>,
  nowMs: number,
): string | null {
  const next = requests
    .map((r) => (r ? Date.parse(r.at) : Number.NaN))
    .filter((t) => Number.isFinite(t) && t > nowMs && t - nowMs <= NOTICE_HOURS * 3_600_000)
    .sort((a, b) => a - b)[0];
  return next === undefined ? null : new Date(next).toISOString();
}
