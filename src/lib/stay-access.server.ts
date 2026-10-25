/**
 * Server only: a property's room-QR and Wi-Fi settings, and the Wi-Fi a
 * guest page shows (the room's own network, else the property's; the
 * password held back until check-in when the host asks). Both columns come
 * with migration 0057; before it, the property's network shows as before.
 */
import { normaliseStayAccess, wifiFor, type StayAccess } from "./stay-access";

type Loose = { from: (t: string) => any };

export async function stayAccessFor(db: Loose, propertyId: string): Promise<StayAccess> {
  const { data, error } = await db.from("properties").select("stay_access").eq("id", propertyId).maybeSingle();
  return normaliseStayAccess(error ? null : data?.stay_access);
}

export type GuestWifi = { name: string; password: string | null; locked: boolean };

export async function guestWifi(
  db: Loose,
  property: { id: string; wifi_name?: string | null; wifi_password?: string | null },
  roomId: string | null,
  checkedIn: boolean,
  access?: StayAccess,
): Promise<GuestWifi | null> {
  const room = roomId ? await db.from("rooms").select("wifi_name, wifi_password").eq("id", roomId).maybeSingle() : { data: null, error: null };
  const wifi = wifiFor(room.error ? null : room.data, property);
  if (!wifi) return null;
  const settings = access ?? (await stayAccessFor(db, property.id));
  const locked = settings.wifiAfterCheckIn && !checkedIn;
  return { name: wifi.name, password: locked ? null : wifi.password, locked };
}
