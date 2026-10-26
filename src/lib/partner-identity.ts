/**
 * Identity keys for Commission Partner fraud checks (agreement 8.3-8.5):
 * normalised so that the same person, business, card or address matches
 * however it was typed, then hashed on the server (partner-identity.server.ts)
 * so only hashes are stored. Pure.
 */

export type IdentityKind =
  | "email"
  | "email_domain"
  | "phone"
  | "legal_name"
  | "business_name"
  | "company_number"
  | "card_fingerprint"
  | "bank_fingerprint"
  | "ip_hash"
  | "device_hash"
  | "property_address"
  | "listing_url"
  | "business_postcode";

export type IdentityValue = { kind: IdentityKind; value: string };

/** Free-mail domains: sharing one says nothing about who you are. */
export const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "gmx.co.uk", "mail.com", "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net", "zoho.com", "yandex.com",
]);

/** An email's mailbox, lower case; Gmail dots and any +tag dropped (they reach the same inbox). */
export function normaliseEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return null;
  let local = e.slice(0, at).split("+")[0]!;
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local ? `${local}@${domain}` : null;
}

/** The domain, only when it's a business's own (not free mail). */
export function businessDomain(email: string): string | null {
  const e = normaliseEmail(email);
  const d = e?.split("@")[1] ?? null;
  return d && !FREE_MAIL.has(d) ? d : null;
}

/** Digits only, with a leading + kept (E.164 is what Latchkey stores). */
export function normalisePhone(phone: string): string | null {
  const t = phone.trim();
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  return t.startsWith("+") ? `+${digits}` : digits;
}

const COMPANY_WORDS = /\b(ltd|limited|llp|plc|inc|llc|co|company|the|and|&)\b/g;

/** Names compared without case, accents, punctuation or company suffixes. */
export function normaliseName(name: string): string | null {
  const t = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(COMPANY_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length >= 2 ? t : null;
}

/** Companies House style numbers: upper case, no spaces, leading zeros kept to 8. */
export function normaliseCompanyNumber(n: string): string | null {
  const t = n.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t.length < 4) return null;
  return /^\d+$/.test(t) ? t.padStart(8, "0") : t;
}

export function normalisePostcode(p: string): string | null {
  const t = p.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return t.length >= 3 ? t : null;
}

/** An address line plus postcode, so "12 High St" and "12, High Street" meet. */
export function normaliseAddress(line: string, postcode?: string | null): string | null {
  const l = line
    .toLowerCase()
    .replace(/\bstreet\b/g, "st")
    .replace(/\broad\b/g, "rd")
    .replace(/\bavenue\b/g, "ave")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const pc = postcode ? normalisePostcode(postcode) : null;
  if (!l && !pc) return null;
  return `${l}|${pc ?? ""}`;
}

/** A listing link without tracking, query or trailing slash. */
export function normaliseUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return null;
  }
}

/** Everything known about a host (or partner) as identity values, normalised and de-duplicated. */
export function identityValues(src: {
  emails?: Array<string | null | undefined>;
  phones?: Array<string | null | undefined>;
  legalNames?: Array<string | null | undefined>;
  businessNames?: Array<string | null | undefined>;
  companyNumber?: string | null;
  addresses?: Array<{ line: string; postcode?: string | null }>;
  postcodes?: Array<string | null | undefined>;
  listingUrls?: Array<string | null | undefined>;
  cardFingerprints?: Array<string | null | undefined>;
  bankFingerprints?: Array<string | null | undefined>;
  ipHash?: string | null;
  deviceHash?: string | null;
}): IdentityValue[] {
  const out: IdentityValue[] = [];
  const add = (kind: IdentityKind, v: string | null | undefined) => {
    if (v && !out.some((x) => x.kind === kind && x.value === v)) out.push({ kind, value: v });
  };
  for (const e of src.emails ?? []) if (e) {
    add("email", normaliseEmail(e));
    add("email_domain", businessDomain(e));
  }
  for (const p of src.phones ?? []) if (p) add("phone", normalisePhone(p));
  for (const n of src.legalNames ?? []) if (n) add("legal_name", normaliseName(n));
  for (const n of src.businessNames ?? []) if (n) add("business_name", normaliseName(n));
  if (src.companyNumber) add("company_number", normaliseCompanyNumber(src.companyNumber));
  for (const a of src.addresses ?? []) add("property_address", normaliseAddress(a.line, a.postcode));
  for (const p of src.postcodes ?? []) if (p) add("business_postcode", normalisePostcode(p));
  for (const u of src.listingUrls ?? []) if (u) add("listing_url", normaliseUrl(u));
  for (const c of src.cardFingerprints ?? []) if (c) add("card_fingerprint", c);
  for (const b of src.bankFingerprints ?? []) if (b) add("bank_fingerprint", b);
  add("ip_hash", src.ipHash ?? null);
  add("device_hash", src.deviceHash ?? null);
  return out;
}

/** Strong matches say "the same person or business"; weak ones only "worth a look" (8.4). */
export const STRONG_KINDS: ReadonlySet<IdentityKind> = new Set(["email", "phone", "card_fingerprint", "company_number", "bank_fingerprint"]);
export const WEAK_KINDS: ReadonlySet<IdentityKind> = new Set(["ip_hash", "device_hash", "email_domain", "legal_name", "business_name"]);

/** Initials and town for a partner's view of a host: never the business's name. */
export function hostLabel(businessName: string, town?: string | null): string {
  const initials = businessName
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(the|and|of|ltd|limited)$/i.test(w))
    .slice(0, 3)
    .map((w) => `${w[0]!.toUpperCase()}.`)
    .join("");
  return [initials || "Host", town?.trim()].filter(Boolean).join(" · ");
}
