/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase clients of either kind, with columns from newer migrations. */
import { nameKey, stayedBefore, type GuestStay } from "./repeat-guest";
import { realEmail } from "./guest-messages";

const COLS =
  "id, status, guest_full_name, guest_email, guest_phone, check_in_date, check_out_date, mirror_of, archived_at";

/**
 * Whether this stay's guest has stayed anywhere in the business before. `idName`
 * is the name read from their ID, for a stay that has none yet. A greeting is never
 * worth failing a check-in over, so any problem just means "no".
 */
export async function isRepeatStay(db: any, bookingId: string, idName?: string | null) {
  try {
    const { data: row } = await db
      .from("bookings")
      .select(`${COLS}, property_id`)
      .eq("id", bookingId)
      .maybeSingle();
    if (!row) return false;
    const stay = {
      ...row,
      guest_full_name: row.guest_full_name?.trim() ? row.guest_full_name : (idName ?? null),
    };
    const { data: prop } = await db
      .from("properties")
      .select("host_id")
      .eq("id", row.property_id)
      .maybeSingle();
    if (!prop) return false;
    const { data: props } = await db.from("properties").select("id").eq("host_id", prop.host_id);
    const ids = (props ?? []).map((p: { id: string }) => p.id);
    const earlier = () =>
      db
        .from("bookings")
        .select(COLS)
        .in("property_id", ids)
        .lt("check_out_date", stay.check_in_date)
        .limit(200);
    const queries = [];
    const longest = [...nameKey(stay.guest_full_name)].sort((a, b) => b.length - a.length)[0];
    if (longest) {
      queries.push(earlier().ilike("guest_full_name", `%${longest.replace(/[%_\\]/g, "\\$&")}%`));
    }
    if (realEmail(stay.guest_email)) {
      queries.push(
        earlier().ilike("guest_email", stay.guest_email.trim().replace(/[%_\\]/g, "\\$&")),
      );
    }
    if (stay.guest_phone) queries.push(earlier().eq("guest_phone", stay.guest_phone));
    const found = await Promise.all(queries);
    return stayedBefore(
      stay,
      found.flatMap((f) => (f.data ?? []) as GuestStay[]),
    );
  } catch {
    return false;
  }
}
