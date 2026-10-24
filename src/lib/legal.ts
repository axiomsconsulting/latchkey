/**
 * The operator's legal details (site_settings.legal, migration 0054) used by
 * the Terms of service and Privacy policy: who runs the service, how to
 * reach them and which law applies. Anything missing falls back to the
 * brand's name and the in-app support route, and missingLegal() tells the
 * super admin what still needs filling in. Pure.
 */

export type LegalDetails = {
  companyName: string;
  companyNumber: string;
  registeredAddress: string;
  contactEmail: string;
  privacyEmail: string;
  icoNumber: string;
  vatNumber: string;
  /** Whose courts and law apply, e.g. "England and Wales". */
  governingLaw: string;
};

export const DEFAULT_LEGAL: LegalDetails = {
  companyName: "",
  companyNumber: "",
  registeredAddress: "",
  contactEmail: "",
  privacyEmail: "",
  icoNumber: "",
  vatNumber: "",
  governingLaw: "England and Wales",
};

/** When the wording of the Terms and Privacy policy last changed (bump with any change to src/content/legal.ts). */
export const LEGAL_UPDATED = "2026-10-24";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f<>]/g, "").trim().slice(0, max) : "");
const email = (v: unknown) => {
  const s = text(v, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
};

export function normaliseLegal(raw: unknown): LegalDetails {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    companyName: text(r["companyName"], 120),
    companyNumber: text(r["companyNumber"], 40),
    registeredAddress: text(r["registeredAddress"], 400),
    contactEmail: email(r["contactEmail"]),
    privacyEmail: email(r["privacyEmail"]),
    icoNumber: text(r["icoNumber"], 40),
    vatNumber: text(r["vatNumber"], 40),
    governingLaw: text(r["governingLaw"], 80) || DEFAULT_LEGAL.governingLaw,
  };
}

/** What the published pages would be missing (for the super admin's form). */
export function missingLegal(d: LegalDetails): Array<keyof LegalDetails> {
  return (["companyName", "registeredAddress", "contactEmail", "icoNumber"] as const).filter((k) => !d[k]);
}

/** The email for privacy requests: the privacy address, else the general one, else none. */
export const privacyContact = (d: LegalDetails) => d.privacyEmail || d.contactEmail || null;
