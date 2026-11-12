/* eslint-disable @typescript-eslint/no-explicit-any -- bank_feeds and bank_receipts are from migration 0108 */
/**
 * Server only: bank transfers received (rules in src/lib/bank-match.ts). Money in comes from a
 * statement the host uploads, or from Starling with the read-only token the host made (sealed
 * here, AES-GCM, only ever used to read). Each payment is kept once (bank_receipts), matched to
 * direct bookings waiting for a transfer, and a sure match marks the booking paid at once.
 */
import { creditsFromStarling, matchCredits, type Credit, type Waiting } from "./bank-match";

const STARLING = "https://api.starlingbank.com";
/** Payments kept this long (the host's own record of what was read and matched). */
const KEEP_DAYS = 400;

async function db(): Promise<any> {
  const { admin } = await import("./checkin.server");
  return admin();
}

async function key(): Promise<CryptoKey> {
  const { signingSecret } = await import("./private-store.server");
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`bank-feed:${signingSecret()}`),
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function seal(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(),
      new TextEncoder().encode(text),
    ),
  );
  return `${b64(iv)}.${b64(out)}`;
}
async function unseal(sealed: string): Promise<string | null> {
  try {
    const [iv, body] = sealed.split(".");
    if (!iv || !body) return null;
    const out = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) },
      await key(),
      unb64(body),
    );
    return new TextDecoder().decode(out);
  } catch {
    return null;
  }
}

async function starling<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${STARLING}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403)
    throw new Error(
      "Starling didn't accept the token. Make a new one with account, account-list and transaction read access.",
    );
  if (!res.ok) throw new Error(`Starling answered ${res.status}. Please try again later.`);
  return (await res.json()) as T;
}

/** Checks the token on Starling, picks the account in the business's currency and keeps the link. */
export async function connectStarling(hostId: string, token: string, currency: string) {
  const t = token.trim();
  const { accounts } = await starling<{
    accounts?: Array<{
      accountUid: string;
      defaultCategory: string;
      currency: string;
      name?: string;
      accountType?: string;
    }>;
  }>(t, "/api/v2/accounts");
  const acct =
    (accounts ?? []).find((a) => a.currency?.toUpperCase() === currency.toUpperCase()) ??
    (accounts ?? [])[0];
  if (!acct) throw new Error("No account was found with that token.");
  const sb = await db();
  const row = {
    host_id: hostId,
    provider: "starling",
    label: acct.name ?? "Starling",
    secret_sealed: await seal(t),
    account_uid: acct.accountUid,
    category_uid: acct.defaultCategory,
    currency: (acct.currency ?? currency).toUpperCase(),
    last_error: null,
  };
  const { error } = await sb.from("bank_feeds").upsert(row, { onConflict: "host_id,provider" });
  if (error)
    throw new Error(
      /bank_feeds/.test(error.message)
        ? "Bank transfers need the latest update (migration 0108)."
        : error.message,
    );
  // The last fortnight straight away, so anything already paid is picked up.
  return readFeed(hostId);
}

export async function disconnectFeed(hostId: string) {
  await (await db()).from("bank_feeds").delete().eq("host_id", hostId);
}

/** Direct bookings of this business waiting for a bank transfer. */
async function waitingFor(
  sb: any,
  hostId: string,
): Promise<Array<Waiting & { propertyId: string; currency: string }>> {
  const { data } = await sb
    .from("direct_reservations")
    .select("id, property_id, reference, total_pence, currency, name, created_at")
    .eq("host_id", hostId)
    .eq("method", "bank")
    .eq("status", "pending")
    .limit(500);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    propertyId: r.property_id,
    reference: r.reference,
    total: r.total_pence,
    currency: (r.currency ?? "GBP").toUpperCase(),
    name: r.name ?? "",
    bookedOn: String(r.created_at).slice(0, 10),
  }));
}

/** A bank transfer booking marked paid (by a sure match, or the host confirming one). */
export async function markTransferPaid(sb: any, reservationId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: r } = await sb
    .from("direct_reservations")
    .select("id, status, method, booking_id, room_list")
    .eq("id", reservationId)
    .maybeSingle();
  if (!r || r.status !== "pending" || r.method !== "bank") return false;
  await sb
    .from("direct_reservations")
    .update({ status: "paid", paid_at: now, updated_at: now })
    .eq("id", reservationId);
  const ids = [
    r.booking_id,
    ...((Array.isArray(r.room_list) ? r.room_list : []) as any[]).map((x) => x?.booking_id),
  ].filter((x, i, a): x is string => typeof x === "string" && a.indexOf(x) === i);
  for (const id of ids) {
    const { data: b } = await sb.from("bookings").select("notes").eq("id", id).maybeSingle();
    await sb
      .from("bookings")
      .update({
        notes: String(b?.notes ?? "").replace("Paying by bank transfer", "Paid by bank transfer"),
      })
      .eq("id", id);
  }
  return true;
}

/**
 * Keeps each payment once and matches the ones not matched yet to bookings waiting for a
 * transfer: sure matches are marked paid (with an alert), likely ones wait for the host.
 */
export async function takeCredits(
  hostId: string,
  source: string,
  credits: Credit[],
  currency: string,
): Promise<{ added: number; paid: number; check: number }> {
  const sb = await db();
  let added = 0;
  if (credits.length) {
    const rows = credits.map((c) => ({
      host_id: hostId,
      source,
      source_id: c.sourceId.slice(0, 200),
      received_on: c.date,
      amount_pence: c.amount,
      currency,
      payer: c.payer?.slice(0, 120) ?? null,
      details: c.text.slice(0, 300),
    }));
    const { data, error } = await sb
      .from("bank_receipts")
      .upsert(rows, { onConflict: "host_id,source_id", ignoreDuplicates: true })
      .select("id");
    if (error)
      throw new Error(
        /bank_receipts/.test(error.message)
          ? "Bank transfers need the latest update (migration 0108)."
          : error.message,
      );
    added = (data ?? []).length;
  }
  // Payments that matched nothing are the host's other income: gone after 60 days.
  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  await sb
    .from("bank_receipts")
    .delete()
    .eq("host_id", hostId)
    .in("match", ["none", "ignored"])
    .lt("received_on", cutoff);
  // Everything not matched yet from the last 60 days, against what's waiting.
  const { data: open } = await sb
    .from("bank_receipts")
    .select("id, source_id, received_on, amount_pence, currency, payer, details")
    .eq("host_id", hostId)
    .eq("match", "none")
    .gte("received_on", new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
    .limit(2000);
  const waiting = await waitingFor(sb, hostId);
  const byCurrency = (cur: string) => waiting.filter((w) => w.currency === cur);
  const openRows = (open ?? []) as any[];
  let paid = 0;
  let check = 0;
  for (const cur of [...new Set(openRows.map((r) => String(r.currency).toUpperCase()))]) {
    const cs: Credit[] = openRows
      .filter((r) => String(r.currency).toUpperCase() === cur)
      .map((r) => ({
        sourceId: r.id,
        date: r.received_on,
        amount: r.amount_pence,
        text: r.details ?? "",
        payer: r.payer ?? null,
      }));
    for (const m of matchCredits(cs, byCurrency(cur))) {
      const w = waiting.find((x) => x.id === m.reservationId)!;
      const ok = m.kind === "paid" ? await markTransferPaid(sb, m.reservationId) : false;
      await sb
        .from("bank_receipts")
        .update({ match: ok ? "paid" : "check", reservation_id: m.reservationId })
        .eq("id", m.credit.sourceId);
      const { raiseAlert } = await import("./checkin.server");
      const { money } = await import("./direct-rates");
      await raiseAlert({
        hostId,
        propertyId: w.propertyId,
        kind: "direct_enquiry",
        message: ok
          ? `Bank transfer received from ${w.name}: ${money(m.credit.amount, cur)}, ref ${w.reference}. The booking is marked paid.`
          : `A bank payment of ${money(m.credit.amount, cur)} may be ${w.name}'s (ref ${w.reference}). Check it on Direct stays.`,
      }).catch(() => undefined);
      if (ok) paid++;
      else check++;
    }
  }
  return { added, paid, check };
}

/** Reads a connected bank for the last fortnight (or since the last read, with two days' overlap). */
export async function readFeed(
  hostId: string,
): Promise<{ added: number; paid: number; check: number }> {
  const sb = await db();
  const { data: f } = await sb
    .from("bank_feeds")
    .select("*")
    .eq("host_id", hostId)
    .eq("provider", "starling")
    .maybeSingle();
  if (!f) return { added: 0, paid: 0, check: 0 };
  const token = await unseal(f.secret_sealed);
  try {
    if (!token) throw new Error("The bank link needs connecting again.");
    const fortnight = Date.now() - 14 * 86_400_000;
    const from = new Date(
      f.last_read_at ? Math.max(fortnight, Date.parse(f.last_read_at) - 2 * 86_400_000) : fortnight,
    );
    const q = new URLSearchParams({
      minTransactionTimestamp: from.toISOString(),
      maxTransactionTimestamp: new Date().toISOString(),
    });
    const body = await starling<{ feedItems?: unknown }>(
      token,
      `/api/v2/feed/account/${encodeURIComponent(f.account_uid)}/category/${encodeURIComponent(f.category_uid)}/transactions-between?${q}`,
    );
    const res = await takeCredits(
      hostId,
      "starling",
      creditsFromStarling(body.feedItems, f.currency),
      f.currency,
    );
    await sb
      .from("bank_feeds")
      .update({ last_read_at: new Date().toISOString(), last_error: null })
      .eq("id", f.id);
    return res;
  } catch (e) {
    await sb
      .from("bank_feeds")
      .update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "Read failed" })
      .eq("id", f.id);
    throw e;
  }
}

/** From the calendar sync: every connected bank, for businesses with a transfer waiting. */
export async function readAllFeeds(): Promise<number> {
  const sb = await db();
  const { data, error } = await sb.from("bank_feeds").select("host_id").limit(1000);
  if (error) return 0;
  let n = 0;
  for (const f of (data ?? []) as Array<{ host_id: string }>) {
    const { count } = await sb
      .from("direct_reservations")
      .select("id", { count: "exact", head: true })
      .eq("host_id", f.host_id)
      .eq("method", "bank")
      .eq("status", "pending");
    if (!count) continue;
    try {
      await readFeed(f.host_id);
      n++;
    } catch (e) {
      console.error("Bank read failed", f.host_id, e instanceof Error ? e.message : e);
    }
  }
  await sb
    .from("bank_receipts")
    .delete()
    .lt("received_on", new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10));
  return n;
}
