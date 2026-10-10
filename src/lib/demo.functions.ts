/**
 * Public "try the demo" entry. Visitors share one demo host account whose
 * demo property is rebuilt once a day (or on request), so nobody needs a
 * login or PIN. Only is_demo rows on that account are ever touched.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { seedDemo } from "./host.functions";

const DEMO_EMAIL = "demo@latchkey.omsestates.uk";
export const DEMO_CODE = "tour";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rebuilds the shared demo property when it is missing, from an earlier day,
 * or has no arrival today, so the guest tour always has someone to check in.
 */
export async function freshDemoCode(admin: any, hostId: string): Promise<string> {
  const { data: prop } = await admin
    .from("properties").select("id, short_code, created_at")
    .eq("host_id", hostId).eq("is_demo", true).limit(1).maybeSingle();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  let stale = !prop || Date.now() - new Date(prop.created_at).getTime() > DAY_MS;
  if (prop && !stale) {
    const seededOn = new Date(prop.created_at).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    const { count } = await admin.from("bookings").select("id", { count: "exact", head: true })
      .eq("property_id", prop.id).eq("check_in_date", today);
    stale = seededOn !== today || !count;
  }
  if (!stale) return prop.short_code as string;
  const fresh = await seedDemo(admin, hostId, DEMO_CODE);
  return fresh.short_code;
}

export const startDemo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ as: z.enum(["host", "guest"]) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // 1. Demo user (created once, email pre-confirmed, random password nobody knows).
    let userId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users?.find((u: { email?: string }) => u.email === DEMO_EMAIL)?.id ?? null;
    if (!userId) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: crypto.randomUUID() + crypto.randomUUID(),
        email_confirm: true,
      });
      if (error) throw new Error("The demo is unavailable right now.");
      userId = created.user.id;
    }

    // 2. Demo host workspace.
    const { data: member } = await admin
      .from("host_members").select("host_id").eq("user_id", userId).limit(1).maybeSingle();
    let hostId: string | null = member?.host_id ?? null;
    if (!hostId) {
      const { data: host, error } = await admin
        .from("hosts")
        .insert({ business_name: "The Trinity Rooms (demo)", contact_email: DEMO_EMAIL, currency: "GBP", timezone: "Europe/London" })
        .select("id").single();
      if (error) throw new Error("The demo is unavailable right now.");
      hostId = host.id as string;
      await admin.from("host_members").insert({ host_id: hostId, user_id: userId, role: "owner" });
    }

    // 3. Daily reset: rebuild if missing or older than a day.
    const code = await freshDemoCode(admin, hostId!);

    if (data.as === "guest") return { code, tokenHash: null };

    // 4. Host: one-time sign-in token, verified in the browser.
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: DEMO_EMAIL });
    if (error) throw new Error("The demo is unavailable right now.");
    return { code, tokenHash: link.properties.hashed_token as string };
  });
