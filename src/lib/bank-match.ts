/**
 * Bank transfers received (migration 0108): payments into the host's own bank account, read from
 * a statement they download from online banking (CSV, any UK bank) or automatically from a bank
 * that lets its customers read their own account with a token (Starling), matched to direct
 * bookings waiting for a transfer by their reference and amount. A sure match (the reference and
 * at least the amount) marks the booking paid; a likely one (the reference with less money, or
 * the right amount from someone with the guest's surname) waits for the host to confirm. Pure;
 * tested in tests/bank-match.test.ts.
 */

export type Credit = {
  /** The bank's own id for it, or a fingerprint of the statement row. */
  sourceId: string;
  date: string;
  /** Hundredths, always more than 0 (money in). */
  amount: number;
  /** Everything the bank shows about it: payer, reference, description. */
  text: string;
  payer: string | null;
};

/* --------------------------------- CSV --------------------------------- */

/** CSV rows, with quoted fields ("a, b"), doubled quotes and either line ending. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim()));
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim()));
  return rows;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** A UK statement's date (31/01/2027, 31-01-27, 2027-01-31, 31 Jan 2027) as 2027-01-31, or null. */
export function statementDate(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  m = /^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2,4})\b/.exec(s);
  if (m && MONTHS[m[2]!.toLowerCase()]) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${MONTHS[m[2]!.toLowerCase()]}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

/** "£1,234.50", "-12.00", "(12.00)", "12.00 CR" → hundredths (negative for money out); null when it isn't a number. */
export function statementAmount(v: string): number | null {
  let s = v.trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\bDR\b/i.test(s)) sign = -1;
  s = s.replace(/\b(CR|DR)\b/gi, "").replace(/[£€$,\s]/g, "");
  if (s.startsWith("-")) {
    sign = -sign;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return sign * Math.round(Number(s) * 100);
}

type Columns = {
  date: number;
  amount: number | null;
  credit: number | null;
  text: number[];
  payer: number | null;
  id: number | null;
};

const has = (h: string, ...words: RegExp[]) => words.some((w) => w.test(h));

/** Which column is which, from a header row (every UK bank names them a little differently). */
export function columnsOf(header: string[]): Columns | null {
  const h = header.map((x) =>
    x
      .toLowerCase()
      .replace(/[^a-z ]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const date = h.findIndex((x) => has(x, /\bdate\b/) && !has(x, /\bvalue date\b/));
  const credit = h.findIndex((x) =>
    has(x, /^paid in$/, /^money in$/, /^credit( amount)?$/, /^in$/, /^credits?$/),
  );
  const amount = h.findIndex((x) => has(x, /^amount\b/, /^value$/, /^transaction amount$/));
  if (date < 0 || (credit < 0 && amount < 0)) return null;
  const text = h
    .map((x, i) => [x, i] as const)
    .filter(([x]) =>
      has(
        x,
        /description/,
        /memo/,
        /reference/,
        /counter ?party/,
        /^name$/,
        /payee/,
        /payer/,
        /details/,
        /narrative/,
        /^type$/,
        /subcategory/,
      ),
    )
    .map(([, i]) => i);
  const payer = h.findIndex((x) => has(x, /counter ?party/, /^name$/, /payer/, /payee/));
  const id = h.findIndex((x) => has(x, /transaction id/, /^id$/, /^number$/, /wise id/));
  return {
    date,
    amount: amount >= 0 ? amount : null,
    credit: credit >= 0 ? credit : null,
    text,
    payer: payer >= 0 ? payer : null,
    id: id >= 0 ? id : null,
  };
}

/** A short fingerprint of a row, so the same statement uploaded twice isn't counted twice. */
export function rowId(parts: string[]): string {
  let h = 2166136261;
  for (const c of parts.join("|")) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return `row-${(h >>> 0).toString(36)}`;
}

/**
 * The money in from a statement CSV. Reads a header row when there is one (Barclays, Lloyds,
 * Halifax, NatWest, Nationwide, Santander, Monzo, Starling, Revolut, Wise, Tide…), or the plain
 * date / description / amount rows some banks (HSBC) export without one.
 */
export function creditsFromCsv(text: string): {
  credits: Credit[];
  rows: number;
  understood: boolean;
} {
  const rows = csvRows(text);
  const headerAt = rows.findIndex((r, i) => i < 10 && columnsOf(r));
  const credits: Credit[] = [];
  if (headerAt >= 0) {
    const c = columnsOf(rows[headerAt]!)!;
    for (const r of rows.slice(headerAt + 1)) {
      const date = statementDate(r[c.date] ?? "");
      const amount =
        c.credit !== null
          ? statementAmount(r[c.credit] ?? "")
          : statementAmount(r[c.amount!] ?? "");
      if (!date || amount === null || amount <= 0) continue;
      const words = c.text.map((i) => r[i] ?? "").filter(Boolean);
      credits.push({
        sourceId:
          c.id !== null && r[c.id] ? `id-${r[c.id]}` : rowId([date, String(amount), ...words]),
        date,
        amount,
        text: words.join(" ").slice(0, 300),
        payer: c.payer !== null ? r[c.payer] || null : null,
      });
    }
    return { credits, rows: rows.length - headerAt - 1, understood: true };
  }
  // No header: date first, amount last (HSBC's export).
  let understood = false;
  for (const r of rows) {
    const date = statementDate(r[0] ?? "");
    const amount = statementAmount(r[r.length - 1] ?? "");
    if (!date || amount === null) continue;
    understood = true;
    if (amount <= 0) continue;
    const words = r.slice(1, -1).filter(Boolean);
    credits.push({
      sourceId: rowId([date, String(amount), ...words]),
      date,
      amount,
      text: words.join(" ").slice(0, 300),
      payer: null,
    });
  }
  return { credits, rows: rows.length, understood };
}

/* ------------------------------- matching ------------------------------- */

export type Waiting = {
  id: string;
  reference: string;
  total: number;
  name: string;
  /** The day it was booked (a payment from before can't be for it). */
  bookedOn: string;
};

export type Match = {
  reservationId: string;
  credit: Credit;
  /** paid = reference and the whole amount; check = for the host to confirm. */
  kind: "paid" | "check";
  why: "reference" | "reference_short" | "amount_and_name";
};

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Does the bank's text carry the booking reference (spaces, dashes and case ignored)? */
export const carriesReference = (text: string, reference: string) =>
  squash(reference).length >= 6 && squash(text).includes(squash(reference));

/** The guest's surname (last word of their name) in the bank's text. */
function surnameIn(text: string, name: string): boolean {
  const last = name.trim().split(/\s+/).pop() ?? "";
  return last.length >= 3 && squash(text).includes(squash(last));
}

/**
 * Matches money in to bookings waiting for a transfer; each payment and booking is used once.
 * A reference with the whole amount (or more) is "paid"; a reference with less, or no reference
 * but the exact amount from someone with the guest's surname, is "check".
 */
export function matchCredits(credits: Credit[], waiting: Waiting[]): Match[] {
  const out: Match[] = [];
  const used = new Set<string>();
  const done = new Set<string>();
  const after = (c: Credit, w: Waiting) => c.date >= w.bookedOn;
  for (const w of waiting) {
    const c = credits.find(
      (x) => !used.has(x.sourceId) && after(x, w) && carriesReference(x.text, w.reference),
    );
    if (!c) continue;
    used.add(c.sourceId);
    done.add(w.id);
    out.push({
      reservationId: w.id,
      credit: c,
      kind: c.amount >= w.total ? "paid" : "check",
      why: c.amount >= w.total ? "reference" : "reference_short",
    });
  }
  for (const w of waiting) {
    if (done.has(w.id)) continue;
    const c = credits.find(
      (x) =>
        !used.has(x.sourceId) &&
        after(x, w) &&
        x.amount === w.total &&
        surnameIn(`${x.text} ${x.payer ?? ""}`, w.name),
    );
    if (!c) continue;
    used.add(c.sourceId);
    out.push({ reservationId: w.id, credit: c, kind: "check", why: "amount_and_name" });
  }
  return out;
}

/* ------------------------------- the banks ------------------------------- */

export type BankWay = "automatic" | "provider" | "statement";

/**
 * How each UK bank can tell Latchkey about money in. Automatic: the bank lets its customers read
 * their own account with a token, at no cost (Starling). Provider: only through a licensed Open
 * Banking provider (Latchkey would need a contract; not offered yet), so a statement for now.
 * Every bank exports a statement CSV from online banking.
 */
export const BANKS: Array<{ key: string; name: string; way: BankWay; export: string }> = [
  {
    key: "starling",
    name: "Starling",
    way: "automatic",
    export: "Automatic with a read-only token",
  },
  {
    key: "barclays",
    name: "Barclays",
    way: "provider",
    export: "Online banking → the account → Export → CSV",
  },
  {
    key: "hsbc",
    name: "HSBC",
    way: "provider",
    export: "Online banking → the account → Download → CSV",
  },
  {
    key: "lloyds",
    name: "Lloyds, Halifax, Bank of Scotland",
    way: "provider",
    export: "Online banking → the account → Export → CSV",
  },
  {
    key: "natwest",
    name: "NatWest, RBS, Ulster Bank",
    way: "provider",
    export: "Online banking → Statements → Download or export → CSV",
  },
  {
    key: "santander",
    name: "Santander",
    way: "provider",
    export: "Online banking → the account → Download transactions → CSV or Excel (save as CSV)",
  },
  {
    key: "nationwide",
    name: "Nationwide",
    way: "provider",
    export: "Internet banking → the account → Download transactions → CSV",
  },
  {
    key: "tsb",
    name: "TSB",
    way: "provider",
    export: "Internet banking → the account → Export → CSV",
  },
  {
    key: "metro",
    name: "Metro Bank",
    way: "provider",
    export: "Online banking → the account → Export → CSV",
  },
  {
    key: "coop",
    name: "Co-operative Bank",
    way: "provider",
    export: "Online banking → the account → Export → CSV",
  },
  {
    key: "monzo",
    name: "Monzo",
    way: "provider",
    export: "App or web → the account → Export → CSV",
  },
  {
    key: "revolut",
    name: "Revolut",
    way: "provider",
    export: "App → the account → Statement → Excel or CSV",
  },
  { key: "wise", name: "Wise", way: "provider", export: "Wise → the balance → Statements → CSV" },
  { key: "tide", name: "Tide", way: "provider", export: "App → Transactions → Export → CSV" },
];

/** Starling's feed items (GET /api/v2/feed/account/…/transactions-between) as money in: settled, incoming, in this currency. */
export function creditsFromStarling(items: unknown, currency: string): Credit[] {
  if (!Array.isArray(items)) return [];
  const out: Credit[] = [];
  for (const x of items) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the bank's JSON
    const i = (x ?? {}) as Record<string, any>;
    if (i["direction"] !== "IN" || i["status"] !== "SETTLED") continue;
    const amount = Number(i["amount"]?.minorUnits);
    if (
      !(amount > 0) ||
      String(i["amount"]?.currency ?? "").toUpperCase() !== currency.toUpperCase()
    )
      continue;
    const date =
      typeof i["transactionTime"] === "string" ? i["transactionTime"].slice(0, 10) : null;
    if (!date || typeof i["feedItemUid"] !== "string") continue;
    const payer = typeof i["counterPartyName"] === "string" ? i["counterPartyName"] : null;
    const ref = typeof i["reference"] === "string" ? i["reference"] : "";
    out.push({
      sourceId: `starling-${i["feedItemUid"]}`,
      date,
      amount,
      text: `${payer ?? ""} ${ref}`.trim().slice(0, 300),
      payer,
    });
  }
  return out;
}
