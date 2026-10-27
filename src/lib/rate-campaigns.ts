/**
 * Commission rate campaigns, such as the Launch Bonus (agreement v1.2,
 * clauses 7.11 to 7.13): a higher Commission Rate for every Referred Host
 * whose first payment after the Free Trial falls inside a campaign's window,
 * in UK time. The rate is fixed on that host's referral at that first
 * payment (lockRate) and never changes afterwards, so editing a campaign
 * only ever affects hosts who haven't paid yet. The super admin edits the
 * list in Latchkey admin → Commission Partners → Rate campaigns
 * (site_settings.commission_partner_programme.rateCampaigns); lowering or
 * shortening one needs 30 days' notice (campaignChangeProblem). Pure;
 * tested in tests/rate-campaigns.test.ts.
 */
import { dayEnd, dayStart, localDate, addDaysToDate } from "./commission";

export type RateCampaign = {
  /** Stable id, e.g. "launch-2026". */
  id: string;
  /** Shown to partners, e.g. "Launch Bonus". */
  label: string;
  /** The Commission Rate during the campaign, in basis points (2000 = 20%). */
  rateBps: number;
  /** First and last UK calendar day of the window (YYYY-MM-DD, inclusive). */
  startDate: string;
  endDate: string;
};

export const DEFAULT_CAMPAIGNS: RateCampaign[] = [
  {
    id: "launch-2026",
    label: "Launch Bonus",
    rateBps: 2000,
    startDate: "2026-10-27",
    endDate: "2026-12-31",
  },
];

/** Days of notice before a campaign may be lowered, shortened or withdrawn (agreement 7.13). */
export const CAMPAIGN_NOTICE_DAYS = 30;
export const MAX_CAMPAIGNS = 20;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: unknown): s is string =>
  typeof s === "string" && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

/** Only well-formed campaigns, sorted by start date; anything else is dropped. */
export function normaliseCampaigns(raw: unknown): RateCampaign[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RateCampaign[] = [];
  for (const c of raw.slice(0, MAX_CAMPAIGNS)) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const id =
      typeof r["id"] === "string"
        ? r["id"]
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-")
            .slice(0, 40)
        : "";
    const label =
      typeof r["label"] === "string"
        ? r["label"]
            .replace(/[*_`{}<>|#]/g, "")
            .trim()
            .slice(0, 60)
        : "";
    const rate = r["rateBps"];
    if (!id || seen.has(id) || !label) continue;
    if (typeof rate !== "number" || !Number.isInteger(rate) || rate <= 0 || rate > 10_000) continue;
    if (!validDate(r["startDate"]) || !validDate(r["endDate"])) continue;
    if (r["endDate"] < r["startDate"]) continue;
    seen.add(id);
    out.push({ id, label, rateBps: rate, startDate: r["startDate"], endDate: r["endDate"] });
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

/** Whether a moment falls inside a campaign's window: from 00:00 on its first day until midnight at the end of its last, UK time. */
export function inWindow(c: RateCampaign, atMs: number): boolean {
  return atMs >= dayStart(c.startDate) && atMs < dayEnd(c.endDate);
}

export type LockedRate = {
  rate_bps: number;
  /** A campaign set the rate (shown as a badge). */
  launch_bonus: boolean;
  campaign_id: string | null;
  campaign_label: string | null;
};

/**
 * The rate fixed for a host at their first payment: the best campaign whose
 * window holds that moment, if it beats the standard rate; otherwise the
 * standard rate.
 */
export function lockRate(
  firstPaymentMs: number,
  standardBps: number,
  campaigns: RateCampaign[],
): LockedRate {
  const best = campaigns
    .filter((c) => inWindow(c, firstPaymentMs) && c.rateBps > standardBps)
    .sort((a, b) => b.rateBps - a.rateBps)[0];
  return best
    ? {
        rate_bps: best.rateBps,
        launch_bonus: true,
        campaign_id: best.id,
        campaign_label: best.label,
      }
    : { rate_bps: standardBps, launch_bonus: false, campaign_id: null, campaign_label: null };
}

/** Campaigns still to come or running at a moment (ended ones drop off). */
export function currentCampaigns(campaigns: RateCampaign[], nowMs: number): RateCampaign[] {
  return campaigns.filter((c) => nowMs < dayEnd(c.endDate));
}

const pctText = (bps: number) => `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(2)}%`;

function ukDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** One campaign in words: "**20%** for hosts whose first payment is made from 27 October 2026 to 23:59 UK time on 31 December 2026 (Launch Bonus)". */
export function campaignSentence(c: RateCampaign): string {
  return `**${pctText(c.rateBps)}** for each Referred Host whose first payment is made from ${ukDay(c.startDate)} to 23:59 UK time on ${ukDay(c.endDate)} (${c.label})`;
}

/** Annex B's list of running and scheduled campaigns. */
export function campaignsText(campaigns: RateCampaign[], nowMs: number): string {
  const live = currentCampaigns(campaigns, nowMs);
  return live.length
    ? live.map(campaignSentence).join("; ")
    : "No Launch Bonus campaign is running or scheduled.";
}

/** For public pages: the label, rate and end date, without markdown. */
export function campaignSummary(c: RateCampaign) {
  return {
    label: c.label,
    rate: pctText(c.rateBps),
    from: ukDay(c.startDate),
    until: ukDay(c.endDate),
  };
}

/**
 * Why a change to the campaigns isn't allowed, or null. Anything that gives
 * partners less (withdrawing a campaign, lowering its rate, starting it
 * later or ending it sooner) may only take effect 30 days or more from now
 * (agreement 7.13). Adding, raising or extending is always allowed, and so
 * is any change to a campaign that ended before today.
 */
export function campaignChangeProblem(
  prev: RateCampaign[],
  next: RateCampaign[],
  nowMs: number,
): string | null {
  const today = localDate(nowMs);
  const earliest = addDaysToDate(today, CAMPAIGN_NOTICE_DAYS);
  const later = (a: string, b: string) => (a > b ? a : b);
  for (const p of prev) {
    if (p.endDate < today) continue;
    const n = next.find((c) => c.id === p.id);
    // From which UK day partners would get less than before.
    let from: string | null = null;
    if (!n) from = later(p.startDate, today);
    else {
      if (n.rateBps < p.rateBps) from = later(p.startDate, today);
      if (n.startDate > p.startDate)
        from = from && from < p.startDate ? from : later(p.startDate, today);
      if (n.endDate < p.endDate) {
        const cut = addDaysToDate(n.endDate, 1);
        from = from && from < cut ? from : cut;
      }
    }
    if (from && from < earliest)
      return `"${p.label}": partners must get ${CAMPAIGN_NOTICE_DAYS} days' notice before a campaign is withdrawn, lowered, started later or ended sooner (agreement 7.13). The earliest such a change can take effect is ${ukDay(earliest)}.`;
  }
  return null;
}
