/* eslint-disable @typescript-eslint/no-explicit-any -- continues_from is from migration 0106 */
/**
 * Guests staying on in the same room on a new booking (continuingStays): once their
 * first stay was checked in and the next one has begun, the next counts as checked in
 * too, with the first stay's ID result, and the first is checked out. Their guide links
 * move to the new booking and last until its check-out, so the guest's page keeps working.
 * No cards or messages: they never left. Runs with every calendar sync.
 */

import { addDays, todayInZone } from "./dates";
import { continuingStays } from "./repeat-guest";

const COLS =
  "id, status, room_id, guest_full_name, guest_email, guest_phone, check_in_date, check_out_date, check_out_time, checked_in_at, mirror_of, archived_at, id_check_status, is_test";

const NOT_YET = new Set(["upcoming", "flagged", "needs_details"]);

export async function carryOnStays(): Promise<{ carried: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: props, error } = await db
    .from("properties")
    .select("id, timezone, default_check_out_time")
    .eq("active", true);
  if (error || !props?.length) return { carried: 0 };
  let carried = 0;
  for (const p of props as Array<{
    id: string;
    timezone: string | null;
    default_check_out_time: string | null;
  }>) {
    const tz = p.timezone ?? "Europe/London";
    const today = todayInZone(tz);
    const from = addDays(today, -1);
    const { data: rows } = await db
      .from("bookings")
      .select(COLS)
      .eq("property_id", p.id)
      .or(
        `and(check_in_date.gte.${from},check_in_date.lte.${today}),and(check_out_date.gte.${from},check_out_date.lte.${today})`,
      )
      .limit(500);
    const stays = ((rows ?? []) as any[]).filter((b) => !b.is_test);
    if (stays.length < 2) continue;
    const { noWelcome } = continuingStays(stays);
    for (const b of stays) {
      if (!noWelcome.has(b.id) || !NOT_YET.has(b.status) || b.check_in_date > today) continue;
      const a = stays.find(
        (x) =>
          x.id !== b.id &&
          x.room_id === b.room_id &&
          x.check_out_date === b.check_in_date &&
          (x.status === "checked_in" || (x.status === "checked_out" && x.checked_in_at)),
      );
      if (!a) continue;
      carried += (await carryOn(db, a, b, p, tz)) ? 1 : 0;
    }
  }
  return { carried };
}

async function carryOn(
  db: any,
  a: any,
  b: any,
  p: { default_check_out_time: string | null },
  tz: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  // Claimed by its status: a second run at the same moment finds it already checked in.
  const patch = {
    status: "checked_in",
    checked_in_at: now,
    id_check_status: a.id_check_status ?? "returning",
    welcome_card_dismissed_at: now,
  };
  const claim = (extra: Record<string, unknown>) =>
    db
      .from("bookings")
      .update({ ...patch, ...extra })
      .eq("id", b.id)
      .in("status", [...NOT_YET])
      .select("id");
  // continues_from is from migration 0106: without it the stay is still carried on.
  let res = await claim({ continues_from: a.id });
  if (res.error) res = await claim({});
  const done = res.data as Array<{ id: string }> | null;
  if (!done?.length) return false;
  if (a.status === "checked_in")
    await db
      .from("bookings")
      .update({ status: "checked_out", checked_out_at: now, goodbye_dismissed_at: now })
      .eq("id", a.id)
      .eq("status", "checked_in");
  // The guest's guide links now open the new booking, until its check-out.
  const { guideWindow } = await import("./guide");
  const win = guideWindow(
    b.check_in_date,
    b.check_out_date,
    (b.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5),
    tz,
  );
  const until = win.expiresAt.toISOString();
  await Promise.all([
    db.from("stay_tokens").update({ booking_id: b.id, expires_at: until }).eq("booking_id", a.id),
    db
      .from("stay_short_links")
      .update({ booking_id: b.id, expires_at: until })
      .eq("booking_id", a.id),
  ]).catch((e: unknown) => console.error("Moving guide links failed", e));
  return true;
}
