/**
 * Public "try the demo" entry. Visitors share one demo host account whose
 * demo property is rebuilt once a day (or on request), so nobody needs a
 * login or PIN. Only is_demo rows on that account are ever touched.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { DEMO_CODE, DEMO_EMAIL } from "./demo-account";
import { seedDemo } from "./host.functions";
import { INTEGRATION_KEYS, type IntegrationModes } from "./integration-modes";

export { DEMO_CODE };

const DAY_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE = "The demo is unavailable right now.";

/** Every outside integration stays simulated on the shared account. */
const ALL_DEMO = Object.fromEntries(INTEGRATION_KEYS.map((k) => [k, "demo"])) as IntegrationModes;
const DEMO_HOST = {
  business_name: "The Hill Suites (demo)",
  contact_email: DEMO_EMAIL,
  currency: "GBP",
  timezone: "Europe/London",
  integration_modes: ALL_DEMO,
};

function londonDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/**
 * Rebuilds the shared demo property when it is missing, from an earlier day,
 * or has no arrival today, so the guest tour always has someone to check in.
 * Concurrent visitors race for one claim, so only one of them rebuilds.
 */
export async function freshDemoCode(admin: any, hostId: string): Promise<string> {
  const { data: prop } = await admin
    .from("properties").select("id, short_code, created_at")
    .eq("host_id", hostId).eq("is_demo", true).eq("short_code", DEMO_CODE).limit(1).maybeSingle();
  const today = londonDay(new Date());
  if (prop && londonDay(new Date(prop.created_at)) === today && Date.now() - Date.parse(prop.created_at) < DAY_MS) {
    const { count } = await admin.from("bookings").select("id", { count: "exact", head: true })
      .eq("property_id", prop.id).eq("check_in_date", today);
    if (count) return DEMO_CODE;
  }
  if (prop) {
    // created_at doubles as "seeded at": only the request that moves it rebuilds.
    const { data: claimed } = await admin
      .from("properties").update({ created_at: new Date().toISOString() })
      .eq("id", prop.id).eq("created_at", prop.created_at).select("id");
    if (!claimed?.length) return DEMO_CODE;
  }
  try {
    // Undo anything changed on the account before the settings lock existed.
    await admin.from("hosts").update(DEMO_HOST).eq("id", hostId);
    await seedDemo(admin, hostId, DEMO_CODE);
  } catch {
    // Someone else created it first (the code is unique); theirs is fine.
  }
  return DEMO_CODE;
}

/**
 * The shared workspace. Normally found through the tour property (only the
 * service role can mark a property as demo), so no user listing is needed.
 */
async function demoHostId(admin: any): Promise<string> {
  const { data: tour } = await admin
    .from("properties").select("host_id").eq("short_code", DEMO_CODE).eq("is_demo", true).maybeSingle();
  if (tour) return tour.host_id as string;

  // Mid-rebuild or first run: find the demo user (creating it once, email
  // pre-confirmed, random password nobody knows), then its own workspace.
  const { data: created } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
  });
  let userId = (created?.user?.id as string | undefined) ?? null;
  if (!userId) {
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: DEMO_EMAIL });
    userId = (link?.user?.id as string | undefined) ?? null;
  }
  if (!userId) throw new Error(UNAVAILABLE);

  const { data: member } = await admin
    .from("host_members").select("host_id").eq("user_id", userId).limit(1).maybeSingle();
  if (member) return member.host_id as string;
  const { data: made, error } = await admin.from("hosts").insert(DEMO_HOST).select("id").single();
  if (error) throw new Error(UNAVAILABLE);
  await admin.from("host_members").insert({ host_id: made.id, user_id: userId, role: "owner" });
  return made.id as string;
}

/** Makes sure today's guest tour exists; used when /p/tour is opened directly. */
export async function ensureTour(admin: any): Promise<void> {
  await freshDemoCode(admin, await demoHostId(admin));
}

export const startDemo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ as: z.enum(["host", "guest"]) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const hostId = await demoHostId(admin);
    const code = await freshDemoCode(admin, hostId);
    if (data.as === "guest") return { code, tokenHash: null };

    // Host: one-time sign-in token, verified in the browser.
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: DEMO_EMAIL });
    if (error) throw new Error(UNAVAILABLE);
    return { code, tokenHash: link.properties.hashed_token as string };
  });
