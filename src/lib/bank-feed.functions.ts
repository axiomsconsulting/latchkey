/* eslint-disable @typescript-eslint/no-explicit-any -- bank_feeds and bank_receipts are from migration 0108 */
/**
 * Bank transfers received, on Direct stays (rules in src/lib/bank-match.ts, reading in
 * bank-feed.server.ts): connect Starling with a read-only token (owners), upload a statement
 * from any bank, and confirm or set aside payments that only might be a guest's.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireOwner, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();

async function admin(): Promise<any> {
  const { admin } = await import("./checkin.server");
  return admin();
}

async function hostCurrency(sb: any, hostId: string, propertyId: string): Promise<string> {
  const { data: p } = await sb
    .from("properties")
    .select("currency, hosts(currency)")
    .eq("id", propertyId)
    .maybeSingle();
  return (
    (p?.currency as string | null) ||
    (p?.hosts?.currency as string | null) ||
    "GBP"
  ).toUpperCase();
}

/** The bank link (never its token), payments read in the last 60 days and what's still waiting. */
export const getBankTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const sb = await admin();
    const [feed, receipts, waiting] = await Promise.all([
      sb
        .from("bank_feeds")
        .select("provider, label, currency, last_read_at, last_error")
        .eq("host_id", hostId)
        .maybeSingle(),
      sb
        .from("bank_receipts")
        .select(
          "id, source, received_on, amount_pence, currency, payer, details, match, reservation_id, direct_reservations(reference, name, total_pence)",
        )
        .eq("host_id", hostId)
        .gte("received_on", new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
        .order("received_on", { ascending: false })
        .limit(200),
      sb
        .from("direct_reservations")
        .select("id, reference, name, total_pence, currency, created_at")
        .eq("host_id", hostId)
        .eq("method", "bank")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    return {
      available: !feed.error && !receipts.error,
      feed: feed.data
        ? {
            provider: feed.data.provider as string,
            label: (feed.data.label as string | null) ?? null,
            lastReadAt: (feed.data.last_read_at as string | null) ?? null,
            lastError: (feed.data.last_error as string | null) ?? null,
          }
        : null,
      // Matched payments and ones to check; plain unmatched payments are only counted (they're the host's other income).
      receipts: ((receipts.data ?? []) as any[])
        .filter((r) => r.match !== "none")
        .map((r) => ({
          id: r.id as string,
          date: r.received_on as string,
          amount: r.amount_pence as number,
          currency: r.currency as string,
          payer: (r.payer as string | null) ?? null,
          details: (r.details as string | null) ?? null,
          match: r.match as "paid" | "check" | "ignored",
          reference: (r.direct_reservations?.reference as string | null) ?? null,
          guest: (r.direct_reservations?.name as string | null) ?? null,
          total: (r.direct_reservations?.total_pence as number | null) ?? null,
        })),
      unmatched: ((receipts.data ?? []) as any[]).filter((r) => r.match === "none").length,
      waiting: ((waiting.data ?? []) as any[]).map((r) => ({
        id: r.id as string,
        reference: r.reference as string,
        name: r.name as string,
        total: r.total_pence as number,
        currency: (r.currency as string | null) ?? "GBP",
        bookedOn: String(r.created_at).slice(0, 10),
      })),
    };
  });

/** Owners connect Starling with a read-only personal access token; the last fortnight is read at once. */
export const connectStarlingFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, token: z.string().trim().min(20).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireOwner(context.supabase, hostId);
    const { connectStarling } = await import("./bank-feed.server");
    return connectStarling(
      hostId,
      data.token,
      await hostCurrency(await admin(), hostId, data.propertyId),
    );
  });

export const disconnectBankFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireOwner(context.supabase, hostId);
    const { disconnectFeed } = await import("./bank-feed.server");
    await disconnectFeed(hostId);
    return { ok: true };
  });

export const readBankNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const { readFeed } = await import("./bank-feed.server");
    return readFeed(hostId);
  });

/** A statement CSV from online banking (any bank): its money in is matched like the bank's own feed. */
export const uploadBankStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, csv: z.string().min(10).max(3_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const { creditsFromCsv } = await import("./bank-match");
    const read = creditsFromCsv(data.csv);
    if (!read.understood)
      throw new Error(
        "That file doesn't look like a bank statement. Download the account's transactions as CSV from online banking and try again.",
      );
    const { takeCredits } = await import("./bank-feed.server");
    const res = await takeCredits(
      hostId,
      "statement",
      read.credits,
      await hostCurrency(await admin(), hostId, data.propertyId),
    );
    return { ...res, credits: read.credits.length };
  });

/** The host says a payment to check is the guest's (the booking is marked paid), or isn't (set aside). */
export const settleBankReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, receiptId: uuid, action: z.enum(["confirm", "ignore"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const sb = await admin();
    const { data: r } = await sb
      .from("bank_receipts")
      .select("id, reservation_id, match")
      .eq("id", data.receiptId)
      .eq("host_id", hostId)
      .maybeSingle();
    if (!r) throw new Error("Payment not found.");
    if (data.action === "confirm") {
      if (!r.reservation_id) throw new Error("That payment isn't linked to a booking.");
      const { markTransferPaid } = await import("./bank-feed.server");
      await markTransferPaid(sb, r.reservation_id);
      await sb.from("bank_receipts").update({ match: "paid" }).eq("id", r.id);
    } else {
      await sb
        .from("bank_receipts")
        .update({ match: "ignored", reservation_id: null })
        .eq("id", r.id);
    }
    return { ok: true };
  });
