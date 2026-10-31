/**
 * The operator's legal details (site_settings.legal, migration 0054) used by
 * the Terms of service and Privacy policy: who runs the service, how to
 * reach them and which law applies. Anything missing falls back to the
 * brand's name and the in-app support route, and missingLegal() tells the
 * super admin what still needs filling in. Pure.
 */

export type LegalDetails = {
  /** The operator's legal name: a person's own name (sole trader) or a company's registered name. */
  companyName: string;
  /** The name the business trades under, e.g. "OMS Estates" (optional). */
  tradingName: string;
  /** Only for a company; empty means the operator is a person (sole trader). */
  companyNumber: string;
  /** A company's registered office, or a sole trader's business address. */
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
  tradingName: "",
  companyNumber: "",
  registeredAddress: "",
  contactEmail: "",
  privacyEmail: "",
  icoNumber: "",
  vatNumber: "",
  governingLaw: "England and Wales",
};

/** When the wording of the Terms and Privacy policy last changed (bump with any change to src/content/legal.ts). */
export const LEGAL_UPDATED = "2026-10-31";

const text = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex -- strips control characters from text people type
        .replace(/[\u0000-\u0009\u000b-\u001f<>]/g, "")
        .trim()
        .slice(0, max)
    : "";
const email = (v: unknown) => {
  const s = text(v, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
};

export function normaliseLegal(raw: unknown): LegalDetails {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    companyName: text(r["companyName"], 120),
    tradingName: text(r["tradingName"], 120),
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
  return (["companyName", "registeredAddress", "contactEmail", "icoNumber"] as const).filter(
    (k) => !d[k],
  );
}

/** The email for privacy requests: the privacy address, else the general one, else none. */
export const privacyContact = (d: LegalDetails) => d.privacyEmail || d.contactEmail || null;

/* ------------------------------------------------- the operator, in words */

// Markdown and placeholder characters never reach an agreement from a setting.
const plain = (v: string) => v.replace(/[*_`{}[\]#|]/g, "").replace(/\s*\n\s*/g, ", ");

/** "Jo Bloggs, trading as OMS Estates" (or just the legal name); null until the legal name is set. */
export function operatorName(d: LegalDetails): string | null {
  const legal = plain(d.companyName);
  if (!legal) return null;
  const trading = plain(d.tradingName);
  return trading && trading.toLowerCase() !== legal.toLowerCase()
    ? `${legal}, trading as ${trading}`
    : legal;
}

/**
 * Who runs the service, in one sentence: a company with its number and
 * registered office, or a person (sole trader) with their business address.
 * null until both the legal name and the address are set.
 */
export function operatorDetails(d: LegalDetails): string | null {
  const name = operatorName(d);
  const address = plain(d.registeredAddress);
  if (!name || !address) return null;
  return d.companyNumber
    ? `${name}, a company registered in ${plain(d.governingLaw)} with company number ${plain(d.companyNumber)}, whose registered office is at ${address}`
    : `${name}, of ${address}`;
}

/** What the Commission Partner agreement still needs before anyone can sign it. */
export function missingOperator(d: LegalDetails): Array<"companyName" | "registeredAddress"> {
  return (["companyName", "registeredAddress"] as const).filter((k) => !d[k]);
}
