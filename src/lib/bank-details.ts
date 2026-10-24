/**
 * The host's bank details for guests paying by transfer, structured for the
 * bank's country (hosts.bank_account, migration 0053) instead of a text box:
 * sort code and account number in the UK, IBAN and BIC across Europe,
 * routing and account number in the US, BSB in Australia, and so on. Each
 * field is checked (IBAN checksum, BIC shape, US routing check digit). A
 * guest in the bank's own country sees the local details; anyone abroad sees
 * the international ones (IBAN or account number with SWIFT/BIC). Pure.
 */

export type BankAccount = {
  country: string;
  accountName: string;
  bankName: string;
  sortCode: string;
  accountNumber: string;
  iban: string;
  bic: string;
  routingNumber: string;
  institution: string;
  transit: string;
  bsb: string;
  ifsc: string;
  branch: string;
};

export type BankField = keyof Omit<BankAccount, "country">;

const BLANK: BankAccount = { country: "GB", accountName: "", bankName: "", sortCode: "", accountNumber: "", iban: "", bic: "", routingNumber: "", institution: "", transit: "", bsb: "", ifsc: "", branch: "" };

/** Countries paying by IBAN (SEPA and neighbours): the IBAN is the local detail too. */
export const IBAN_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "MC", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH",
  "AE", "SA", "TR", "IL", "QA", "BH", "KW", "JO", "LB", "PK", "GE", "AZ", "UA", "MD", "ME", "RS", "AL", "MK", "BA", "XK", "GI", "SM", "VA", "AD", "FO", "GL",
];

export type FieldSpec = { key: BankField; label: string; placeholder: string; required: boolean };

/** What a host in this country fills in: the local details, then what international guests need. */
export function bankFields(country: string): { local: FieldSpec[]; international: FieldSpec[] } {
  const c = country.toUpperCase();
  const name: FieldSpec = { key: "accountName", label: "Account holder's name", placeholder: "Trinity Suites Ltd", required: true };
  const bank: FieldSpec = { key: "bankName", label: "Bank name", placeholder: "", required: false };
  // Examples only where they're the country's own.
  const iban = (required: boolean): FieldSpec => ({ key: "iban", label: "IBAN", placeholder: c === "GB" ? "GB29 NWBK 6016 1331 9268 19" : c === "DE" ? "DE89 3704 0044 0532 0130 00" : "", required });
  const bic = (required: boolean): FieldSpec => ({ key: "bic", label: "BIC / SWIFT code", placeholder: c === "GB" ? "NWBKGB2L" : "", required });
  if (c === "GB") {
    return {
      local: [name, { key: "sortCode", label: "Sort code", placeholder: "60-16-13", required: true }, { key: "accountNumber", label: "Account number", placeholder: "31926819", required: true }, bank],
      international: [iban(false), bic(false)],
    };
  }
  if (IBAN_COUNTRIES.includes(c)) return { local: [name, iban(true), bic(false), bank], international: [] };
  if (c === "US") {
    return {
      local: [name, bank, { key: "routingNumber", label: "Routing number (ABA)", placeholder: "026009593", required: true }, { key: "accountNumber", label: "Account number", placeholder: "", required: true }],
      international: [bic(false)],
    };
  }
  if (c === "CA") {
    return {
      local: [name, bank, { key: "institution", label: "Institution number", placeholder: "001", required: true }, { key: "transit", label: "Transit number", placeholder: "00011", required: true }, { key: "accountNumber", label: "Account number", placeholder: "", required: true }],
      international: [bic(false)],
    };
  }
  if (c === "AU") {
    return { local: [name, bank, { key: "bsb", label: "BSB", placeholder: "062-000", required: true }, { key: "accountNumber", label: "Account number", placeholder: "12345678", required: true }], international: [bic(false)] };
  }
  if (c === "NZ") return { local: [name, bank, { key: "accountNumber", label: "Account number", placeholder: "12-3456-7890123-00", required: true }], international: [bic(false)] };
  if (c === "IN") {
    return { local: [name, bank, { key: "ifsc", label: "IFSC", placeholder: "HDFC0000123", required: true }, { key: "accountNumber", label: "Account number", placeholder: "", required: true }], international: [bic(false)] };
  }
  if (c === "JP") {
    return {
      local: [name, bank, { key: "branch", label: "Branch name and number", placeholder: "Shinjuku (001)", required: true }, { key: "accountNumber", label: "Account number (ordinary account)", placeholder: "1234567", required: true }],
      international: [bic(false)],
    };
  }
  return { local: [name, bank, { key: "accountNumber", label: "Account number", placeholder: "", required: false }, iban(false)], international: [bic(false)] };
}

const tidy = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");
const compact = (v: unknown, max = 40) => tidy(v, max).replace(/[\s-]/g, "").toUpperCase();

/** From anything stored or typed: trimmed, codes upper-case without spaces. */
export function normaliseBankAccount(raw: unknown, fallbackCountry = "GB"): BankAccount {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const country = typeof r["country"] === "string" && /^[A-Z]{2}$/.test(r["country"]) ? r["country"] : fallbackCountry.toUpperCase();
  return {
    ...BLANK,
    country,
    accountName: tidy(r["accountName"], 120),
    bankName: tidy(r["bankName"], 120),
    sortCode: compact(r["sortCode"]).replace(/\D/g, ""),
    accountNumber: tidy(r["accountNumber"], 40).replace(/\s/g, ""),
    iban: compact(r["iban"], 40),
    bic: compact(r["bic"], 11),
    routingNumber: compact(r["routingNumber"]).replace(/\D/g, ""),
    institution: compact(r["institution"]).replace(/\D/g, ""),
    transit: compact(r["transit"]).replace(/\D/g, ""),
    bsb: compact(r["bsb"]).replace(/\D/g, ""),
    ifsc: compact(r["ifsc"], 11),
    branch: tidy(r["branch"], 80),
  };
}

/** IBAN check: right length band and the mod-97 checksum. */
export function ibanValid(iban: string): boolean {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

export const bicValid = (bic: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic.toUpperCase());

/** US routing number: 9 digits with its check digit (weights 3, 7, 1). */
export function abaValid(n: string): boolean {
  if (!/^\d{9}$/.test(n)) return false;
  const d = n.split("").map(Number);
  const sum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
  return sum % 10 === 0;
}

/** What needs fixing before guests can be shown these details (empty = fine). */
export function bankProblems(a: BankAccount): Array<{ key: BankField; message: string }> {
  const out: Array<{ key: BankField; message: string }> = [];
  const { local, international } = bankFields(a.country);
  for (const f of [...local, ...international]) if (f.required && !a[f.key]) out.push({ key: f.key, message: `Add the ${f.label.toLowerCase()}.` });
  if (a.iban && !ibanValid(a.iban)) out.push({ key: "iban", message: "That IBAN doesn't check out: please look at it again." });
  if (a.bic && !bicValid(a.bic)) out.push({ key: "bic", message: "A BIC / SWIFT code is 8 or 11 letters and numbers." });
  if (a.sortCode && !/^\d{6}$/.test(a.sortCode)) out.push({ key: "sortCode", message: "A sort code is 6 digits." });
  if (a.country === "GB" && a.accountNumber && !/^\d{8}$/.test(a.accountNumber)) out.push({ key: "accountNumber", message: "A UK account number is 8 digits." });
  if (a.routingNumber && !abaValid(a.routingNumber)) out.push({ key: "routingNumber", message: "That routing number doesn't check out." });
  if (a.bsb && !/^\d{6}$/.test(a.bsb)) out.push({ key: "bsb", message: "A BSB is 6 digits." });
  if (a.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(a.ifsc)) out.push({ key: "ifsc", message: "An IFSC is 11 characters, like HDFC0000123." });
  // The same key twice (required and invalid): say it once.
  return out.filter((p, i) => out.findIndex((q) => q.key === p.key) === i);
}

/** Enough filled in, and nothing wrong, to show to guests. */
export const bankReady = (a: BankAccount) => !!a.accountName && bankProblems(a).length === 0;

const groups = (s: string, n = 4) => s.replace(new RegExp(`(.{${n}})`, "g"), "$1 ").trim();
const SHOWN: Partial<Record<BankField, (v: string) => string>> = {
  sortCode: (v) => v.replace(/^(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3"),
  bsb: (v) => v.replace(/^(\d{3})(\d{3})$/, "$1-$2"),
  iban: (v) => groups(v),
};

/**
 * The lines a guest sees: in the bank's own country, its local details; from
 * abroad, the international ones (IBAN or account number, SWIFT/BIC, bank and
 * country). Only filled-in lines.
 */
export function bankLinesFor(a: BankAccount, guestCountry: string | null): Array<{ label: string; value: string }> {
  const { local, international } = bankFields(a.country);
  const home = !guestCountry || guestCountry.toUpperCase() === a.country;
  const line = (f: FieldSpec) => (a[f.key] ? { label: f.label, value: (SHOWN[f.key] ?? ((v: string) => v))(a[f.key]) } : null);
  if (home) return local.map(line).filter((x): x is { label: string; value: string } => !!x);
  const intl: FieldSpec[] = [
    { key: "accountName", label: "Account holder's name", placeholder: "", required: true },
    a.iban ? { key: "iban", label: "IBAN", placeholder: "", required: true } : { key: "accountNumber", label: "Account number", placeholder: "", required: true },
    { key: "bic", label: "SWIFT / BIC", placeholder: "", required: false },
    { key: "bankName", label: "Bank", placeholder: "", required: false },
    ...(a.country === "US" && a.routingNumber ? [{ key: "routingNumber" as const, label: "Routing number (ABA)", placeholder: "", required: false }] : []),
    ...international.filter((f) => !["bic", "iban"].includes(f.key)),
  ];
  const lines = intl.map(line).filter((x): x is { label: string; value: string } => !!x);
  return [...lines, { label: "Bank's country", value: a.country }];
}
