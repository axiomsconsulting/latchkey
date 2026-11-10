/* eslint-disable @typescript-eslint/no-explicit-any -- is_test and test_room_id are from migration 0092 */
import { addDays } from "./dates";
import { TEST_KEEP_DAYS } from "./test-stay";

/** Everything else that names a stay and outlives it (their booking_id only goes empty otherwise). */
export const KEEP_AFTER_STAY = [
  "guest_contacts",
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
  // Anything signed during the test, with its files.
  const { data: signed } = await db
    .from("stay_agreements")
    .select("signature_path, pdf_path")
    .eq("booking_id", bookingId);
  const files = (
    (signed ?? []) as Array<{ signature_path: string | null; pdf_path: string | null }>
  ).flatMap((r) => [r.signature_path, r.pdf_path]);
  if (files.some(Boolean)) {
    const { removePrivate } = await import("./private-store.server");
    await removePrivate(files).catch(() => undefined);
  }
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

/** The sample photos as data URLs, from the private store. */
export async function samplesAsUrls(
  row: { id_ref: string | null; face_ref: string | null } | null,
) {
  const { readPrivate } = await import("./private-store.server");
  const asUrl = async (ref: string | null) => {
    if (!ref) return null;
    const file = await readPrivate(ref).catch(() => null);
    if (!file) return null;
    let bin = "";
    for (let i = 0; i < file.bytes.length; i += 0x8000)
      bin += String.fromCharCode(...file.bytes.subarray(i, i + 0x8000));
    return `data:image/jpeg;base64,${btoa(bin)}`;
  };
  const [id, face] = await Promise.all([asUrl(row?.id_ref ?? null), asUrl(row?.face_ref ?? null)]);
  return { id, face };
}

/** Once a check-in has found the host's own test stay: its sample photos, for the steps still to come. */
export async function samplesForTestBooking(
  db: any,
  propertyId: string,
): Promise<{ id: string | null; face: string | null } | null> {
  const { data: row, error } = await db
    .from("test_check_in_samples")
    .select("id_ref, face_ref")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error || !row) return null;
  return samplesAsUrls(row);
}
