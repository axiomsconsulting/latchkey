/**
 * Public "try the demo" entry. Visitors share one demo host account whose
 * demo property is rebuilt once a day (or on request), so nobody needs a
 * login or PIN. Only is_demo rows on that account are ever touched.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { DEMO_CODE, DEMO_EMAIL, DEMO_INTEGRATION_MODES } from "./demo-account";
import { seedDemo } from "./host.functions";

export { DEMO_CODE };

const DAY_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE = "The demo is unavailable right now.";
const TOO_MANY = "You've opened the demo a lot from here in the last hour. Please try again a little later.";
const DEMO_STARTS_PER_HOUR = 30;

const DEMO_HOST = {
  business_name: "The Hill Suites (demo)",
  contact_email: DEMO_EMAIL,
  currency: "GBP",
  timezone: "Europe/London",
  integration_modes: DEMO_INTEGRATION_MODES,
};

function londonDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/**
 * The one demo routine: every public demo property (The Hill Suites' tour and
 * the four regional demos) is rebuilt when it's missing, from an earlier day,
 * or has nobody arriving today, so each tour always has someone to check in.
 * Each property is rebuilt on its own (never wiping the others), and
 * concurrent visitors race for one claim per property, so only one rebuilds.
 */
export async function refreshDemoProperties(admin: any, hostId: string, force = false): Promise<void> {
  const { SHOWCASE } = await import("./demo-showcase");
  const { todayInZone } = await import("./dates");
  const { seedShowcase } = await import("./host.functions");
  const targets: Array<{ code: string; seed: () => Promise<unknown> }> = [
    { code: DEMO_CODE, seed: () => seedDemo(admin, hostId, DEMO_CODE) },
    ...SHOWCASE.map((spec) => ({ code: spec.short_code, seed: () => seedShowcase(admin, hostId, spec) })),
  ];
  const started = Date.now();
  let rebuilt = 0;
  // Undo anything changed on the account before the settings lock existed.
  let hostFixed = false;
  await Promise.all(
    targets.map(async (t) => {
      const { data: prop } = await admin
        .from("properties").select("id, short_code, created_at, timezone")
        .eq("host_id", hostId).eq("is_demo", true).eq("short_code", t.code).limit(1).maybeSingle();
      // "Today" is the property's own (Tokyo's starts before London's).
      const tz = (prop?.timezone as string | null) ?? "Europe/London";
      const today = todayInZone(tz);
      if (!force && prop && todayInZone(tz, new Date(prop.created_at)) === today && Date.now() - Date.parse(prop.created_at) < DAY_MS) {
        const { count } = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("property_id", prop.id).eq("check_in_date", today);
        if (count) return;
      }
      if (prop) {
        // created_at doubles as "seeded at": only the request that moves it rebuilds.
        const { data: claimed } = await admin
          .from("properties").update({ created_at: new Date().toISOString() })
          .eq("id", prop.id).eq("created_at", prop.created_at).select("id");
        if (!claimed?.length) return;
      }
      try {
        if (!hostFixed) {
          hostFixed = true;
          await admin.from("hosts").update(DEMO_HOST).eq("id", hostId);
        }
        await t.seed();
        rebuilt++;
      } catch {
        // Someone else created it first (the code is unique); theirs is fine.
      }
    }),
  );
  if (rebuilt) {
    const { recordRun } = await import("./usage.server");
    await recordRun("demo_tour", `Rebuilt ${rebuilt} of ${targets.length} demo properties`, started);
  }
}

/** Kept for older callers: refreshes every demo property and returns The Hill Suites' tour code. */
export async function freshDemoCode(admin: any, hostId: string, force = false): Promise<string> {
  await refreshDemoProperties(admin, hostId, force);
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

/** Makes sure today's guest tour exists; used when /kiosk/tour is opened directly. `force` rebuilds it anyway. */
export async function ensureTour(admin: any, force = false): Promise<void> {
  await refreshDemoProperties(admin, await demoHostId(admin), force);
}

export const startDemo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ as: z.enum(["host", "guest"]), region: z.enum(["texas", "mayfair", "paris", "tokyo"]).optional() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { showcaseByKey } = await import("./demo-showcase");
    const spec = data.region ? showcaseByKey(data.region) : null;
    // The super admin can switch the public demo off (Latchkey admin → Routines).
    const { jobAllowed } = await import("./usage.server");
    if (!(await jobAllowed("demo_tour"))) throw new Error(UNAVAILABLE);

    // A fair limit per visitor (a one-day hash of their address, never the address itself).
    const { getRequest } = await import("@tanstack/react-start/server");
    const { hashIp, requestIp } = await import("./ip-hash.server");
    const ipHash = hashIp(requestIp(getRequest().headers));
    if (ipHash) {
      const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const { count, error: countError } = await admin.from("demo_starts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("at", hourAgo);
      // Before migration 0045 there's no table: no limit.
      if (!countError && (count ?? 0) >= DEMO_STARTS_PER_HOUR) throw new Error(TOO_MANY);
      if (!countError) await admin.from("demo_starts").insert({ ip_hash: ipHash, kind: data.as });
    }

    const hostId = await demoHostId(admin);
    await refreshDemoProperties(admin, hostId);
    // The regional demo asked for, or The Hill Suites.
    const code = spec?.short_code ?? DEMO_CODE;
    const { data: prop } = await admin.from("properties").select("id").eq("host_id", hostId).eq("is_demo", true).eq("short_code", code).maybeSingle();
    const propertyId = (prop?.id as string | undefined) ?? null;
    if (data.as === "guest") return { code, tokenHash: null, propertyId };

    // Host: one-time sign-in token, verified in the browser.
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: DEMO_EMAIL });
    if (error) throw new Error(UNAVAILABLE);
    return { code, tokenHash: link.properties.hashed_token as string, propertyId };
  });

/**
 * Super admin: (re)fills the screen-recording account, a separate host the
 * public demo never touches. Its sign-in is RECORDING_HOST_EMAIL (Lovable
 * Cloud → Secrets); the account is made by hand, never here, and no password
 * passes through this code. Only that host's sample rows are replaced.
 */
export const seedRecordingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireSuperAdmin } = await import("./roles");
    await requireSuperAdmin(context.supabase);
    // Tolerate quotes pasted into the secret along with the address.
    const email = (process.env["RECORDING_HOST_EMAIL"] ?? "").trim().replace(/^["'<\s]+|["'>\s]+$/g, "").toLowerCase();
    if (!email) throw new Error("Set RECORDING_HOST_EMAIL in Lovable Cloud → Secrets first.");
    if (email === DEMO_EMAIL) throw new Error("The recording account must not be the shared demo account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // Find the person (never create them).
    let userId: string | null = null;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error("Couldn't look up the recording account.");
      const users = (data?.users ?? []) as Array<{ id: string; email?: string | null }>;
      userId = users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
      if (users.length < 200) break;
    }
    if (!userId) {
      // Say which address was looked for (masked), so a mistyped secret is easy to spot.
      const [local = "", domain = ""] = email.split("@");
      const masked = `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
      throw new Error(`No account signed up as ${masked} (RECORDING_HOST_EMAIL). Check the secret matches the account's sign-in email, or create the account in Lovable Cloud → Authentication first.`);
    }

    // Its own business (made once), kept on demo integrations and never billed.
    const name = (process.env["RECORDING_BUSINESS_NAME"] ?? "").trim() || "The Hill Suites";
    const { data: member } = await admin.from("host_members").select("host_id").eq("user_id", userId).eq("role", "owner").limit(1).maybeSingle();
    let hostId = (member?.host_id as string | undefined) ?? null;
    const fields = { business_name: name, contact_email: email, currency: "GBP", timezone: "Europe/London", integration_modes: DEMO_INTEGRATION_MODES, subscription_status: "comped" };
    if (hostId) {
      await admin.from("hosts").update(fields).eq("id", hostId);
    } else {
      const { data: made, error } = await admin.from("hosts").insert(fields).select("id").single();
      if (error) throw new Error(error.message);
      hostId = made.id as string;
      await admin.from("host_members").insert({ host_id: hostId, user_id: userId, role: "owner" });
    }

    // Three weeks of realistic stays, a request or two, a conversation, today's turnovers.
    const { buildRecordingBookings } = await import("./demo-data");
    const bookings = buildRecordingBookings();
    const staying = bookings.filter((b) => b.status === "checked_in" && b.guest_full_name);
    const leavingSoon = staying.find((b) => b.check_out_offset === 1) ?? staying[1] ?? staying[0];
    const towels = staying[0];
    const jobs = [
      ...(towels ? [{ roomKey: towels.roomKey, guest: towels.guest_full_name, source: "guest" as const, category: "linen", title: "Fresh towels", note: "Could we have fresh towels this afternoon?", urgency: "normal" as const, status: "new" as const }] : []),
      ...(leavingSoon ? [{ roomKey: leavingSoon.roomKey, guest: leavingSoon.guest_full_name, source: "guest" as const, category: "late_checkout", title: "Late check-out", note: "Flight is in the evening: could we stay until 1pm?", urgency: "low" as const, status: "acknowledged" as const }] : []),
      { roomKey: "r2", guest: null, source: "maintenance" as const, category: "handyman", title: "Wardrobe door sticks", note: "Plane the bottom edge.", urgency: "low" as const, status: "new" as const },
    ];
    const messages = towels?.guest_full_name
      ? [
          { guest: towels.guest_full_name, direction: "inbound" as const, minutesAgo: 95, body: "Hello! Is there somewhere nearby for breakfast?" },
          { guest: towels.guest_full_name, direction: "outbound" as const, minutesAgo: 80, body: "Yes: The Old Bakery opens at 7:30, two minutes' walk. It's in your guide under Local tips too." },
          { guest: towels.guest_full_name, direction: "inbound" as const, minutesAgo: 20, body: "Perfect, thank you. Could we also have fresh towels later?" },
        ]
      : [];

    const property = await seedDemo(admin, hostId, "showcase", { bookings, jobs: jobs as never, messages, readiness: true });
    return { ok: true, propertyCode: property.short_code, stays: bookings.length };
  });
