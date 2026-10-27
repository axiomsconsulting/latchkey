/**
 * The Commission Partner part of the Stripe webhook. Server only. Runs
 * before the existing branches and answers only for events about a
 * Commission Partner (partner-webhook.ts has the rules); for anything else
 * it returns false and the webhook carries on exactly as before.
 */
import type { PartnerStore } from "./partner-webhook";
import { processPartnerEvent } from "./partner-webhook";
import {
  adminDb,
  check,
  checkDisputeRate,
  isMissingTable,
  loadPartnerConfig,
  logPartnerEvent,
  PartnersNotSetUp,
  runReferralChecks,
  type AnyDb,
} from "./partner-data.server";
import { partnerStripeMode, v1 } from "./partner-stripe.server";
import { identityHash } from "./partner-identity.server";

const BUSY_MS = 5 * 60_000;

function store(db: AnyDb): PartnerStore {
  let configCache: Awaited<ReturnType<typeof loadPartnerConfig>> | null = null;
  const config = async () => (configCache ??= await loadPartnerConfig(db));
  return {
    async claimEvent(id, type, livemode) {
      const now = new Date().toISOString();
      const ins = await db
        .from("stripe_events")
        .upsert(
          { event_id: id, type, livemode, processing_started_at: now },
          { onConflict: "event_id", ignoreDuplicates: true },
        )
        .select("event_id");
      check(ins);
      if ((ins.data ?? []).length) return { state: "new" as const };
      const row = check(
        await db
          .from("stripe_events")
          .select("processed_at, processing_started_at, result, error")
          .eq("event_id", id)
          .single(),
      ) as {
        processed_at: string | null;
        processing_started_at: string | null;
        result: string | null;
        error: string | null;
      };
      if (row.processed_at) return { state: "done" as const, result: row.result };
      const stale =
        !row.processing_started_at || Date.now() - Date.parse(row.processing_started_at) > BUSY_MS;
      if (!row.error && !stale) return { state: "busy" as const };
      // A failed or abandoned attempt: take it over (only one retry can).
      const take = await db
        .from("stripe_events")
        .update({ processing_started_at: now, error: null })
        .eq("event_id", id)
        .is("processed_at", null)
        .eq("processing_started_at", row.processing_started_at)
        .select("event_id");
      return (take.data ?? []).length ? { state: "new" as const } : { state: "busy" as const };
    },
    async finishEvent(id, result, error) {
      await db
        .from("stripe_events")
        .update(error ? { error } : { processed_at: new Date().toISOString(), result, error: null })
        .eq("event_id", id);
    },
    config,
    mode: () => partnerStripeMode(),
    async hostIdForInvoice(inv) {
      const meta =
        inv?.subscription_details?.metadata?.host_id ??
        inv?.parent?.subscription_details?.metadata?.host_id ??
        inv?.lines?.data?.[0]?.metadata?.host_id;
      if (typeof meta === "string") return meta;
      const subId =
        typeof inv?.subscription === "string"
          ? inv.subscription
          : inv?.parent?.subscription_details?.subscription;
      if (typeof subId === "string") {
        const { data } = await db
          .from("hosts")
          .select("id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();
        if (data?.id) return data.id as string;
        const sub = await v1<{ metadata?: { host_id?: string } }>(
          `/subscriptions/${encodeURIComponent(subId)}`,
        ).catch(() => null);
        if (sub?.metadata?.host_id) return sub.metadata.host_id;
      }
      if (typeof inv?.customer === "string") {
        const { data } = await db
          .from("hosts")
          .select("id")
          .eq("stripe_customer_id", inv.customer)
          .maybeSingle();
        if (data?.id) return data.id as string;
      }
      return null;
    },
    async referralForHost(hostId) {
      const { data, error } = await db
        .from("referrals")
        .select("*")
        .eq("host_id", hostId)
        .maybeSingle();
      if (error) {
        if (isMissingTable(error)) return null;
        throw new Error(error.message);
      }
      return data;
    },
    async referral(id) {
      return check(await db.from("referrals").select("*").eq("id", id).maybeSingle());
    },
    async partner(id) {
      return check(
        await db
          .from("partners")
          .select("id, terminated_at, termination_for_breach, stripe_account_id")
          .eq("id", id)
          .maybeSingle(),
      );
    },
    async partnerByAccount(account) {
      const { data, error } = await db
        .from("partners")
        .select("id, terminated_at, termination_for_breach, stripe_account_id")
        .eq("stripe_account_id", account)
        .maybeSingle();
      if (error) {
        if (isMissingTable(error)) return null;
        throw new Error(error.message);
      }
      return data;
    },
    async hostBilling(hostId) {
      const { data } = await db
        .from("hosts")
        .select("trial_ends_at, subscription_status")
        .eq("id", hostId)
        .maybeSingle();
      return {
        trialEndsAt: data?.trial_ends_at ?? null,
        comped: data?.subscription_status === "comped",
      };
    },
    async hasOpenFlag(referralId) {
      const { count } = await db
        .from("fraud_flags")
        .select("id", { count: "exact", head: true })
        .eq("referral_id", referralId)
        .eq("status", "open");
      return (count ?? 0) > 0;
    },
    fetchCharge: (id) => v1(`/charges/${encodeURIComponent(id)}`).catch(() => null) as never,
    fetchInvoice: (id) => v1(`/invoices/${encodeURIComponent(id)}`).catch(() => null) as never,
    async chargeRecord(chargeId) {
      const { data, error } = await db
        .from("partner_charges")
        .select("*")
        .eq("charge_id", chargeId)
        .maybeSingle();
      if (error) {
        if (isMissingTable(error)) return null;
        throw new Error(error.message);
      }
      return data;
    },
    async saveCharge(c) {
      check(
        await db
          .from("partner_charges")
          .upsert(c, { onConflict: "charge_id", ignoreDuplicates: true }),
      );
    },
    async savePendingDispute(chargeId, status, amountPence, eventId) {
      // Before migration 0062 there's nowhere to keep it: the old behaviour (ignored) stands.
      await db.from("partner_pending_disputes").upsert(
        {
          charge_id: chargeId,
          status,
          amount_pence: amountPence,
          event_id: eventId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "charge_id" },
      );
    },
    async takePendingDispute(chargeId) {
      const { data } = await db
        .from("partner_pending_disputes")
        .select("status, amount_pence")
        .eq("charge_id", chargeId)
        .is("applied_at", null)
        .maybeSingle();
      if (!data) return null;
      await db
        .from("partner_pending_disputes")
        .update({ applied_at: new Date().toISOString() })
        .eq("charge_id", chargeId);
      return data as { status: "open" | "won" | "lost"; amount_pence: number | null };
    },
    async updateCharge(chargeId, patch) {
      check(await db.from("partner_charges").update(patch).eq("charge_id", chargeId));
    },
    async updateReferral(id, patch) {
      check(await db.from("referrals").update(patch).eq("id", id));
    },
    async insertLines(lines) {
      let added = 0;
      for (const l of lines) {
        const { error } = await db.from("commission_ledger").insert(l);
        if (!error) added++;
        // The same invoice's commission or the same referral's bonus is already there: a replay.
        else if (error.code !== "23505") throw new Error(error.message);
      }
      return added;
    },
    async linesForCharge(chargeId) {
      return (
        check(await db.from("commission_ledger").select("*").eq("stripe_charge_id", chargeId)) ?? []
      );
    },
    async linesForReferral(referralId) {
      return (
        check(await db.from("commission_ledger").select("*").eq("referral_id", referralId)) ?? []
      );
    },
    async setLineState(ids, state) {
      if (ids.length) check(await db.from("commission_ledger").update({ state }).in("id", ids));
    },
    async insertClawbacks(partnerId, rows, eventId) {
      for (const r of rows) {
        const { error } = await db
          .from("clawbacks")
          .insert({ partner_id: partnerId, source_event_id: eventId, ...r });
        if (error && error.code !== "23505") throw new Error(error.message);
      }
    },
    async setBonusClaim(referralId, status) {
      await db.from("launch_bonus_claims").update({ status }).eq("referral_id", referralId);
    },
    async addHostCard(hostId, fingerprint) {
      await db.from("host_identity_keys").upsert(
        {
          host_id: hostId,
          kind: "card_fingerprint",
          value_hash: identityHash("card_fingerprint", fingerprint),
        },
        { onConflict: "host_id,kind,value_hash", ignoreDuplicates: true },
      );
    },
    async recheck(referralId) {
      await runReferralChecks(db, referralId, await config());
    },
    async checkDisputeRate(partnerId) {
      await checkDisputeRate(db, partnerId, await config());
    },
    async flag(referralId, partnerId, kind, details) {
      await db.from("fraud_flags").insert({
        referral_id: referralId,
        partner_id: partnerId,
        kind,
        strength: "weak",
        details,
      });
    },
    async updatePartner(id, patch) {
      check(await db.from("partners").update(patch).eq("id", id));
    },
    async payoutTransferReversed(transferId, amountReversed, fully) {
      const { data } = await db
        .from("payouts")
        .select("id, partner_id")
        .eq("stripe_transfer_id", transferId)
        .maybeSingle();
      if (!data) return false;
      if (fully) await db.from("payouts").update({ status: "reversed" }).eq("id", data.id);
      await logPartnerEvent(db, {
        partner_id: data.partner_id,
        action: "transfer_reversed",
        details: { payout: data.id, transfer: transferId, amount_reversed: amountReversed },
      });
      return true;
    },
    log: (e) => logPartnerEvent(db, e),
  };
}

/**
 * true: a Commission Partner event, done (or already done). false: not
 * ours, carry on. A Response: answer Stripe with it (409 while another
 * delivery of the same event is still being processed).
 */
export async function handlePartnerEvent(event: unknown): Promise<boolean | Response> {
  const e = event as { type?: unknown };
  const { isPartnerEventType } = await import("./partner-webhook");
  if (!isPartnerEventType(e?.type)) return false;
  try {
    const out = await processPartnerEvent(event as Record<string, unknown>, store(await adminDb()));
    if (out === "busy") return new Response("busy", { status: 409 });
    return out === "handled";
  } catch (err) {
    // Before migration 0061 there's nothing to do; and a host's own account.updated must never be held up by partner code.
    if (err instanceof PartnersNotSetUp || e.type === "account.updated") {
      if (!(err instanceof PartnersNotSetUp))
        console.error("Commission Partner webhook:", err instanceof Error ? err.message : "error");
      return false;
    }
    throw err;
  }
}
