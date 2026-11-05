/* eslint-disable @typescript-eslint/no-explicit-any -- is_test and test_room_id are from migration 0092 */
import { addDays } from "./dates";
import { TEST_KEEP_DAYS } from "./test-stay";

/** Everything else that names a stay and outlives it (their booking_id only goes empty otherwise). */
const KEEP_AFTER_STAY = [
  "guest_register",
  "invoices",
  "kiosk_messages",
  "kiosk_device_messages",
  "check_in_attempts",
  "feedback",
  "inbound_emails",
  "direct_enquiries",
  "direct_reservations",
  "stay_agreements",
  "host_alerts",
  "service_jobs",
];

/**
 * Removes a test stay and all it saved: ID and face photos from the private store, every row
 * above, then the stay itself, whose own rows (people, sessions, messages, links) go with it.
 * Only ever touches a row marked as a test.
 */
export async function wipeTestStay(db: any, bookingId: string): Promise<boolean> {
  const { data: b } = await db
    .from("bookings")
    .select("id, is_test")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b?.is_test) return false;
  const { removeGuestPhotos } = await import("./checkin.server");
  const { data: people } = await db
    .from("guest_ids")
    .select("id_photo_path, face_photo_path")
    .eq("booking_id", bookingId);
  await removeGuestPhotos(
    ((people ?? []) as Array<{ id_photo_path: string | null; face_photo_path: string | null }>)
      .flatMap((p) => [p.id_photo_path, p.face_photo_path])
      .filter((x): x is string => !!x),
  );
  for (const table of KEEP_AFTER_STAY) {
    // A table missing on an older database has nothing to clear.
    await db
      .from(table)
      .delete()
      .eq("booking_id", bookingId)
      .then(
        () => {},
        () => {},
      );
  }
  const { error } = await db.from("bookings").delete().eq("id", bookingId).eq("is_test", true);
  if (error) throw new Error(error.message);
  return true;
}

/** Forgotten ones go by themselves, so a host's test never stays in the register. */
export async function sweepTestStays(db: any, today: string) {
  const { data } = await db
    .from("bookings")
    .select("id")
    .eq("is_test", true)
    .lt("check_out_date", addDays(today, -TEST_KEEP_DAYS))
    .limit(100);
  for (const row of (data ?? []) as Array<{ id: string }>) await wipeTestStay(db, row.id);
}

/** Which of these stays are tests. Before the migration: none. */
export async function testIds(db: any, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await db.from("bookings").select("id").in("id", ids).eq("is_test", true);
  return new Set(error ? [] : ((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}

/** For the guest's own screens: the room the host picked. Before the migration: nothing. */
export async function testRoomOf(
  db: any,
  bookingId: string,
): Promise<{ isTest: boolean; roomId: string | null }> {
  const { data, error } = await db
    .from("bookings")
    .select("is_test, test_room_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !data?.is_test) return { isTest: false, roomId: null };
  if (!data.test_room_id) return { isTest: true, roomId: null };
  // A plain column, not a link (a second link would break every rooms(...) query): the room may have gone.
  const { data: room } = await db
    .from("rooms")
    .select("id")
    .eq("id", data.test_room_id)
    .maybeSingle();
  return { isTest: true, roomId: room?.id ?? null };
}
