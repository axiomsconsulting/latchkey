/**
 * A host's own domain for their guests. Pure rules: what a usable domain is,
 * and the DNS records the owner adds. The server checks them
 * (domains.functions.ts); the hosting side is connected by the super admin.
 */

/** Domains the platform itself runs on: never a host's. */
export const PLATFORM_SUFFIXES = [
  "omsestates.uk",
  "lovable.app",
  "lovable.dev",
  "lovableproject.com",
  "workers.dev",
  "localhost",
];

/** "https://Stay.Hill-Suites.co.uk/path" → "stay.hill-suites.co.uk", or null if it isn't a usable domain. */
export function normaliseDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (d.startsWith("www.") && d.split(".").length > 3) d = d.slice(4);
  if (
    d.length > 253 ||
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)
  )
    return null;
  if (!/[a-z]/.test(d.split(".").pop() ?? "")) return null;
  return d;
}

export function isPlatformDomain(domain: string, extra: string[] = []): boolean {
  return [...PLATFORM_SUFFIXES, ...extra].some((s) => domain === s || domain.endsWith(`.${s}`));
}

/** The TXT record that proves the owner controls the domain. */
export function verifyRecord(domain: string, token: string): { name: string; value: string } {
  return { name: `_latchkey-verify.${domain}`, value: `latchkey-verify=${token}` };
}

/** Whether TXT answers (as DNS returns them, often quoted) include the expected value. */
export function txtMatches(answers: string[], value: string): boolean {
  return answers.some((a) => a.replace(/^"|"$/g, "").replace(/"\s*"/g, "").trim() === value);
}
