/* eslint-disable @typescript-eslint/no-explicit-any -- returning_checks is from migration 0106 */
import { nameKey, earlierCheck, type RoomStay } from "./repeat-guest";
import { realEmail } from "./guest-messages";
import {
  isBritish,
  normaliseReturningMode,
  skipsIdAgain,
  type EarlierId,
  type ReturningMode,
} from "./returning-checks";

const COLS =
  "id, status, room_id, guest_full_name, guest_email, guest_phone, check_in_date, check_out_date, mirror_of, archived_at, is_test";

/** The host's choice for this property (lenient until migration 0106 is applied). */
export async function returningMode(db: any, propertyId: string): Promise<ReturningMode> {
  const { data, error } = await db
    .from("properties")
    .select("returning_checks")
    .eq("id", propertyId)
    .maybeSingle();
  return normaliseReturningMode(error ? null : data?.returning_checks);
}

/**
 * The latest earlier stay of this guest anywhere in the business that has an ID check
 * (any result), whether it runs straight on into this one in the same room, and whether
 * they're British. Any problem means null: the usual ID check.
 */
export async function earlierIdFor(db: any, bookingId: string): Promise<EarlierId | null> {
  try {
    const { data: stay } = await db
      .from("bookings")
      .select(`${COLS}, property_id`)
      .eq("id", bookingId)
      .maybeSingle();
    if (!stay || stay.is_test || !stay.guest_full_name?.trim()) return null;
    const { data: prop } = await db
      .from("properties")
      .select("host_id")
      .eq("id", stay.property_id)
      .maybeSingle();
    if (!prop) return null;
    const { data: props } = await db.from("properties").select("id").eq("host_id", prop.host_id);
    const ids = (props ?? []).map((p: { id: string }) => p.id);
    const earlier = () =>
      db
        .from("bookings")
        .select(COLS)
        .in("property_id", ids)
        .lte("check_out_date", stay.check_in_date)
        .neq("id", stay.id)
        .limit(200);
    const queries = [];
    const longest = [...nameKey(stay.guest_full_name)].sort((a, b) => b.length - a.length)[0];
    if (longest)
      queries.push(earlier().ilike("guest_full_name", `%${longest.replace(/[%_\\]/g, "\\$&")}%`));
    if (realEmail(stay.guest_email))
      queries.push(
        earlier().ilike("guest_email", stay.guest_email.trim().replace(/[%_\\]/g, "\\$&")),
      );
    if (stay.guest_phone) queries.push(earlier().eq("guest_phone", stay.guest_phone));
    const found = await Promise.all(queries);
    const others = found
      .flatMap((f: any) => (f.data ?? []) as Array<RoomStay & { is_test?: boolean }>)
      .filter((b) => !b.is_test);
    if (!others.length) return null;
    const { data: people } = await db
      .from("guest_ids")
      .select("booking_id, issuing_country")
      .in(
        "booking_id",
        others.map((o) => o.id),
      )
      .eq("position", 0);
    const checked = new Set<string>(
      ((people ?? []) as Array<{ booking_id: string }>).map((r) => r.booking_id),
    );
    const e = earlierCheck(stay as RoomStay, others, checked);
    if (!e) return null;
    const before = others.find((o) => o.id === e.bookingId);
    const { data: entry } = await db
      .from("guest_register")
      .select("nationality")
      .eq("booking_id", e.bookingId)
      .eq("position", 0)
      .maybeSingle();
    const issuing = (
      (people ?? []) as Array<{ booking_id: string; issuing_country: string | null }>
    ).find((r) => r.booking_id === e.bookingId)?.issuing_country;
    return {
      bookingId: e.bookingId,
      continued: e.continued && !!stay.room_id && before?.room_id === stay.room_id,
      british: isBritish(entry?.nationality ?? null, issuing ?? null),
    };
  } catch {
    return null;
  }
}

/** This stay's guest needn't show their ID again (the host's choice), or null. */
export async function returningSkip(
  db: any,
  bookingId: string,
  propertyId: string,
): Promise<EarlierId | null> {
  const [mode, earlier] = await Promise.all([
    returningMode(db, propertyId),
    earlierIdFor(db, bookingId),
  ]);
  return skipsIdAgain(mode, earlier) ? earlier : null;
}
