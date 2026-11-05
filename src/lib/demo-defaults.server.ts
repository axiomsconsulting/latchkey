/* eslint-disable @typescript-eslint/no-explicit-any -- demo_property_defaults is from migration 0094 */
import { DEMO_CODE, DEMO_CODES } from "./demo-account";

const SUPPORT_DAYS = 30;

/** The shared demo business: the one holding the public tour. A host's own sample data doesn't count. */
export async function isSharedDemoHost(db: any, hostId: string): Promise<boolean> {
  const { data } = await db
    .from("properties")
    .select("id")
    .eq("host_id", hostId)
    .eq("is_demo", true)
    .in("short_code", [...DEMO_CODES])
    .limit(1);
  return !!data?.length;
}

/** Latchkey admin opening the demo business: there's no owner to ask, so changes are on at once. */
export async function openDemoToSupport(db: any, hostId: string): Promise<string | null> {
  if (!(await isSharedDemoHost(db, hostId))) return null;
  const until = new Date(Date.now() + SUPPORT_DAYS * 86_400_000).toISOString();
  await db.from("hosts").update({ support_access_until: until }).eq("id", hostId);
  return until;
}

/** What's kept for this property, if anything. Before the migration: nothing. */
export async function savedDemoSettings(db: any, shortCode: string): Promise<unknown> {
  const { data, error } = await db
    .from("demo_property_defaults")
    .select("settings")
    .eq("short_code", shortCode)
    .maybeSingle();
  return error ? null : (data?.settings ?? null);
}

export { DEMO_CODE };
