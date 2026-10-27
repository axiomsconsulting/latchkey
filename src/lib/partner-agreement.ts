/**
 * The Commission Partner agreement as shown on the website (agreement v1.0,
 * docs/legal/partner-agreement-v1.0.md). Pure: filling in the Annex B
 * values, the Launch Bonus wording, the check that the programme settings
 * still match the published text, and a small Markdown reader shared by the
 * agreement page and the signed PDF. The text itself lives in
 * partner_agreement_versions; nothing here changes its wording.
 */
import { campaignsText, currentCampaigns, type RateCampaign } from "./rate-campaigns";
import type { BonusTier } from "./commission";
import type { PartnerConfig } from "./partner-config";

const UK = "Europe/London";

/** "£12.50" from pence. */
export function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/** "1 November 2026", UK time. Plain dates ("2026-11-01") are read as that calendar day. */
export function ukDate(value: string | number | Date): string {
  const d =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: UK,
  });
}

/** "1 November 2026, 14:05 UK time". */
export function ukDateTime(value: string | number | Date): string {
  const d = new Date(value);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: UK });
  return `${ukDate(d)}, ${time} UK time`;
}

const ordinal = (n: number) => {
  const s =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th");
  return `${n}${s}`;
};

export type AgreementTerms = {
  label: string;
  effective_from: string;
  bonus_amount_pence: number | null;
  bonus_tiers: BonusTier[] | null;
  bonus_end_date: string | null;
};

/** Annex B: a Launch Bonus applies only with an amount (or tiers) and a Bonus End Date. */
export function bonusApplies(t: AgreementTerms): boolean {
  return (t.bonus_amount_pence !== null || !!t.bonus_tiers?.length) && !!t.bonus_end_date;
}

function tierList(tiers: BonusTier[]): string {
  const sorted = [...tiers].sort((a, b) => a.from_nth - b.from_nth);
  return sorted
    .map((t, i) => {
      const next = sorted[i + 1];
      const range = next
        ? next.from_nth - 1 === t.from_nth
          ? `your ${ordinal(t.from_nth)} host`
          : `your ${ordinal(t.from_nth)} to ${ordinal(next.from_nth - 1)} host`
        : `your ${ordinal(t.from_nth)} host onwards`;
      return `${pounds(t.pence)} for ${range}`;
    })
    .join("; ");
}

/**
 * The one-off bonus sentence (Annex B), used for both {{bonus_summary}} and
 * {{bonus_clause_text}}. Versions up to 1.1 called it the Launch Bonus; from
 * 1.2 it is the Sign-up Bonus, and "Launch Bonus" is the higher rate (7.11).
 */
export function bonusText(t: AgreementTerms, name = "Launch Bonus"): string {
  if (!bonusApplies(t))
    return `**No ${name} currently applies.** If OMS introduces one, it will tell you and show it here.`;
  const amount = t.bonus_tiers?.length
    ? tierList(t.bonus_tiers)
    : pounds(t.bonus_amount_pence ?? 0);
  return `**${amount}** for each Referred Host who signs up on or before **${ukDate(t.bonus_end_date!)}**, pays within 60 days of signing up and completes their first paid month.`;
}

export type AgreementSettings = {
  launchDate: string | null;
  noticeEmail: string | null;
  /** Rate campaigns (Launch Bonus, 7.11) and the moment the text is shown; none when left out. */
  rateCampaigns?: RateCampaign[];
  now?: number;
  /** Who runs Latchkey, from Site settings → Legal details (operatorName/operatorDetails in legal.ts); null until filled in. */
  operatorName?: string | null;
  operatorDetails?: string | null;
};

const OPERATOR_PENDING = "the operator (details to be confirmed)";

export const NOTICE_EMAIL_FALLBACK = "the email address shown in your Account";

/** Every Annex B value, as text, for {{placeholders}}. */
export function agreementValues(a: {
  version: string;
  publishedAt: string | null;
  bodySha256: string;
  terms: AgreementTerms;
  settings: AgreementSettings;
}): Record<string, string> {
  const t = a.terms;
  const bonusName = Number(a.version) >= 1.2 ? "Sign-up Bonus" : "Launch Bonus";
  const campaigns = a.settings.rateCampaigns ?? [];
  const now = a.settings.now ?? Date.now();
  const live = currentCampaigns(campaigns, now);
  const launch = a.settings.launchDate;
  let yearEnd = "to be confirmed";
  if (launch && /^\d{4}-\d{2}-\d{2}$/.test(launch)) {
    const [y, m, d] = launch.split("-").map(Number) as [number, number, number];
    yearEnd = ukDate(new Date(Date.UTC(y + 1, m - 1, d - 1, 12)));
  }
  return {
    "agreement.published_at": a.publishedAt
      ? ukDate(a.publishedAt)
      : "the date shown when it is published",
    "agreement.version": a.version,
    "agreement.hash_short": a.bodySha256.slice(0, 12),
    bonus_summary: bonusText(t, bonusName),
    bonus_clause_text: bonusText(t, bonusName),
    "campaigns.list": campaignsText(campaigns, now),
    "campaigns.summary": live.length
      ? `${campaignsText(campaigns, now)}, for that host's first 12 paid months (clause 7.11). Standard rate 10% otherwise.`
      : "no Launch Bonus campaign is running or scheduled at the moment; the standard 10% applies.",
    "terms.bonus_amount": t.bonus_amount_pence !== null ? pounds(t.bonus_amount_pence) : "None",
    "terms.bonus_tiers": t.bonus_tiers?.length ? tierList(t.bonus_tiers) : "None",
    "terms.bonus_end_date": t.bonus_end_date ? ukDate(t.bonus_end_date) : "None",
    "terms.label": t.label,
    "terms.effective_from": ukDate(t.effective_from),
    "programme.launch_date": launch ? ukDate(launch) : "to be confirmed",
    "programme.launch_year_end": yearEnd,
    "config.notice_email": a.settings.noticeEmail?.trim() || NOTICE_EMAIL_FALLBACK,
    "operator.name": a.settings.operatorName || OPERATOR_PENDING,
    "operator.details": a.settings.operatorDetails || OPERATOR_PENDING,
  };
}

/**
 * Fills {{placeholders}} with their values. Placeholders inside `code`
 * (where the agreement names them) stay as written. An unknown one is an
 * error: the partner must never sign text with a gap in it.
 */
export function fillAgreement(template: string, values: Record<string, string>): string {
  return template
    .split(/(`[^`\n]*`)/)
    .map((part) =>
      part.startsWith("`")
        ? part
        : part.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
            if (!(key in values))
              throw new Error(`The agreement has an unknown placeholder: ${key}`);
            return values[key]!;
          }),
    )
    .join("");
}

/** SHA-256 of text (UTF-8), as hex. Works in the browser and on the server. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Programme settings that the published v1.0 text states as numbers. If any
 * differ, the text would be wrong, so signing stays closed until a new
 * version is published (the problems are listed for the admin).
 */
export function settingsMismatch(
  c: Pick<
    PartnerConfig,
    | "holdDays"
    | "minPayoutPence"
    | "attributionWindowDays"
    | "bonusFirstPaymentDeadlineDays"
    | "payoutCadence"
  >,
): string[] {
  const out: string[] = [];
  if (c.holdDays !== 45) out.push(`Hold Period is ${c.holdDays} days; the agreement says 45.`);
  if (c.minPayoutPence !== 1000)
    out.push(`Minimum payout is ${pounds(c.minPayoutPence)}; the agreement says £10.`);
  if (c.attributionWindowDays !== 60)
    out.push(`Attribution Window is ${c.attributionWindowDays} days; the agreement says 60.`);
  if (c.bonusFirstPaymentDeadlineDays !== 60)
    out.push(
      `Launch Bonus payment deadline is ${c.bonusFirstPaymentDeadlineDays} days; the agreement says 60.`,
    );
  if (c.payoutCadence !== "monthly")
    out.push("Payouts aren't monthly; the agreement says monthly.");
  return out;
}

/* ------------------------------------------------------------ Markdown */

export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };
export type Block =
  | { type: "heading"; level: number; text: string; id: string }
  | { type: "para"; inlines: Inline[] }
  | { type: "list"; items: Inline[][]; checkboxes: boolean }
  | { type: "quote"; blocks: Block[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "rule" };

/** **bold**, *italic* and `code`; everything else is plain text (never HTML). */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) out.push({ text: m[3], code: true });
    else out.push({ text: m[4]!, italic: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export const plain = (inlines: Inline[]) => inlines.map((i) => i.text).join("");

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => parseInline(c.trim()));

/** The agreement's Markdown as blocks: headings, paragraphs, lists, quotes, tables and rules. */
export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: "heading", level: h[1]!.length, text: h[2]!.trim(), id: slug(h[2]!) });
      i++;
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">"))
        inner.push(lines[i++]!.replace(/^>\s?/, ""));
      blocks.push({ type: "quote", blocks: parseMarkdown(inner.join("\n")) });
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) rows.push(lines[i++]!);
      const body = rows.slice(1).filter((r) => !/^\|[\s:|-]+\|?\s*$/.test(r));
      blocks.push({ type: "table", header: cells(rows[0]!), rows: body.map(cells) });
      continue;
    }
    if (/^- /.test(line)) {
      const items: Inline[][] = [];
      let checkboxes = false;
      while (i < lines.length && /^- /.test(lines[i]!)) {
        let item = lines[i++]!.slice(2);
        if (/^\[ \] /.test(item)) {
          checkboxes = true;
          item = item.slice(4);
        }
        items.push(parseInline(item));
      }
      blocks.push({ type: "list", items, checkboxes });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|>|\||- |-{3,}\s*$)/.test(lines[i]!))
      para.push(lines[i++]!.trim());
    blocks.push({ type: "para", inlines: parseInline(para.join(" ")) });
  }
  return blocks;
}

/**
 * Splits the agreement into what is read and the signing section (the
 * website shows a real form there): the "Signing" heading up to the next rule.
 */
export function splitSigning(blocks: Block[]): {
  before: Block[];
  signing: Block[];
  after: Block[];
} {
  const start = blocks.findIndex((b) => b.type === "heading" && /^signing/i.test(b.text));
  if (start < 0) return { before: blocks, signing: [], after: [] };
  let end = blocks.findIndex((b, j) => j > start && b.type === "rule");
  if (end < 0) end = blocks.length;
  return {
    before: blocks.slice(0, start),
    signing: blocks.slice(start, end),
    after: blocks.slice(end),
  };
}

/** The confirmation boxes, word for word from the signing section. */
export function signingTicks(blocks: Block[]): string[] {
  const { signing } = splitSigning(blocks);
  const list = signing.find(
    (b): b is Extract<Block, { type: "list" }> => b.type === "list" && b.checkboxes,
  );
  return list ? list.items.map(plain) : [];
}

/** The contents list: the numbered clauses and annexes. */
export function contents(blocks: Block[]): Array<{ id: string; text: string }> {
  return blocks
    .filter((b): b is Extract<Block, { type: "heading" }> => b.type === "heading" && b.level === 2)
    .map((b) => ({ id: b.id, text: b.text }));
}

/** A typed full legal name: at least two words. */
export function fullNameProblem(name: string): string | null {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length < 2) return "Type your full legal name: your first name and surname at least.";
  if (name.trim().length > 200) return "That name is too long.";
  return null;
}
