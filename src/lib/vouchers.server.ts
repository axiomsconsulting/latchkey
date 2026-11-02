/* eslint-disable @typescript-eslint/no-explicit-any -- direct_vouchers is from migration 0082, newer than the generated types */
/**
 * Server only: Loyalty discount vouchers read by code, held for a booking
 * (one use) and released again when the booking never goes ahead.
 */
import { normaliseCode, normalisePeriods, type Voucher } from "./vouchers";

type Loose = { from: (t: string) => any };

export type StoredVoucher = Voucher & { id: string; currency: string };

/** A property's voucher by the code a guest typed, or null (also before the migration). */
export async function voucherByCode(
  db: Loose,
  propertyId: string,
  code: string | null | undefined,
): Promise<StoredVoucher | null> {
  const c = normaliseCode(code ?? "");
  if (c.length < 4) return null;
  const { data, error } = await db
    .from("direct_vouchers")
    .select("id, code, guest_name, room_ids, periods, kind, value, status, currency")
    .eq("property_id", propertyId)
    .eq("code", c)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    code: data.code,
    guestName: data.guest_name,
    roomIds: (data.room_ids ?? []) as string[],
    periods: normalisePeriods(data.periods),
    kind: data.kind,
    value: data.value,
    status: data.status,
    currency: data.currency,
  };
}

/** Holds the voucher for one booking; false when someone else used it first. */
export async function claimVoucher(db: Loose, id: string): Promise<boolean> {
  const { data } = await db
    .from("direct_vouchers")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "active")
    .select("id");
  return ((data ?? []) as unknown[]).length === 1;
}

export async function linkVoucher(db: Loose, id: string, reservationId: string): Promise<void> {
  await db.from("direct_vouchers").update({ reservation_id: reservationId }).eq("id", id);
}

/** A booking that didn't go ahead gives its voucher back. */
export async function releaseVoucher(
  db: Loose,
  by: { id: string } | { reservationId: string },
): Promise<void> {
  const q = db
    .from("direct_vouchers")
    .update({ status: "active", used_at: null, reservation_id: null })
    .eq("status", "used");
  await ("id" in by ? q.eq("id", by.id) : q.eq("reservation_id", by.reservationId));
}
