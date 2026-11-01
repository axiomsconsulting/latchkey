/**
 * Latchkey admin → Integrations → Test all connections: one line per
 * outside service with a status and, when it isn't working, the exact fix.
 * Pure; tested in tests/connection-health.test.ts.
 */

export type Health = "ok" | "warn" | "fail" | "off";

export type HealthLine = {
  key: string;
  name: string;
  status: Health;
  detail: string;
  /** What to do, when it isn't ok. */
  fix: string | null;
};

/** A real call's outcome, or a missing setting, as one line. */
export function line(
  key: string,
  name: string,
  o:
    | { configured: false; fix: string; optional?: boolean }
    | { configured: true; ok: boolean; detail: string; fix: string; warn?: boolean },
): HealthLine {
  if (!o.configured)
    return {
      key,
      name,
      status: o.optional ? "off" : "fail",
      detail: o.optional ? "Not set up (optional)" : "Not set up",
      fix: o.fix,
    };
  if (o.ok)
    return {
      key,
      name,
      status: o.warn ? "warn" : "ok",
      detail: o.detail,
      fix: o.warn ? o.fix : null,
    };
  return { key, name, status: "fail", detail: o.detail, fix: o.fix };
}

/** The worst status first, so what needs doing is at the top. */
export function sortLines(lines: HealthLine[]): HealthLine[] {
  const rank: Record<Health, number> = { fail: 0, warn: 1, off: 2, ok: 3 };
  return [...lines].sort((a, b) => rank[a.status] - rank[b.status]);
}
