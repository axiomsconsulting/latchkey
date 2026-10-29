/* eslint-disable @typescript-eslint/no-explicit-any -- reads columns the generated Supabase types don't cover yet */
/**
 * The check-in journey's settings (src/lib/checkin-flow.ts): the host's own
 * per property (properties.checkin_flow, also written into the older
 * checkin_methods and guest_records switches so they agree), and Latchkey
 * admin's starting journey with steps required or removed for everyone
 * (site_settings.checkin_flow, super admins only).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  STEP_IDS,
  effectiveFlow,
  normaliseFlow,
  normalisePolicy,
  toMethods,
  toRecords,
  type FlowChoices,
} from "@/lib/checkin-flow";
import { normaliseRecords } from "@/lib/guest-records";
import { registerApplies } from "@/lib/hotel-register";
import { hostOfProperty, requireSuperAdmin, requireWrite } from "@/lib/roles";

type Loose = { from: (t: string) => any };
const uuid = z.string().uuid();
const side = z.enum(["front", "back"]);
const choices = z.object({
  steps: z.object(
    Object.fromEntries(STEP_IDS.map((id) => [id, z.boolean()])) as Record<
      (typeof STEP_IDS)[number],
      z.ZodBoolean
    >,
  ),
  checkout: z.enum(["three", "week"]),
  idCamera: side,
  selfieCamera: side,
});
const stepList = z.array(z.enum(STEP_IDS)).max(STEP_IDS.length);

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

/**
 * Whether ID reading runs for this business: Latchkey's routine is on and
 * its ID check isn't switched off; demo mode reads sample details.
 */
async function idReading(hostId: string): Promise<"live" | "demo" | "off"> {
  const { hostModes } = await import("./checkin.server");
  if ((await hostModes(hostId)).id_check === "demo") return "demo";
  const { jobAllowed } = await import("./usage.server");
  return (await jobAllowed("ai_id_reading")) ? "live" : "off";
}

/** The host's view of one property's journey, with Latchkey's rules and what affects it. */
export const getCheckinFlow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: p, error } = await sb
      .from("properties")
      .select("host_id, country_code, checkin_methods, guest_records, checkin_flow")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error || !p) return { available: false as const };
    const { flowPolicy, ownFlow } = await import("./checkin-flow.server");
    const policy = await flowPolicy();
    const own = ownFlow(p, policy);
    const records = normaliseRecords(p.guest_records);
    return {
      available: true as const,
      /** null: follows Latchkey's starting journey. */
      own,
      policy,
      uk: registerApplies(p.country_code),
      regulatorConfirmed: records.regulatorConfirmed,
      keepDays: records.keepDays,
      idReading: await idReading(p.host_id),
    };
  });

/** Saves the property's journey (null: back to Latchkey's), and the older switches to match. */
export const saveCheckinFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, flow: choices.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const sb = context.supabase as unknown as Loose;
    const { data: p, error } = await sb
      .from("properties")
      .select("country_code, checkin_methods, guest_records")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error || !p) throw new Error("Property not found.");
    const { flowPolicy } = await import("./checkin-flow.server");
    const policy = await flowPolicy(true);
    const own: FlowChoices | null = data.flow ? normaliseFlow(data.flow, policy.defaults) : null;
    const flow = effectiveFlow(own, policy, { uk: registerApplies(p.country_code) });
    const { error: saveErr } = await sb
      .from("properties")
      .update({
        checkin_flow: own,
        checkin_methods: toMethods(flow),
        guest_records: toRecords(flow, normaliseRecords(p.guest_records)),
      })
      .eq("id", data.propertyId);
    if (saveErr)
      throw new Error(
        /checkin_flow/.test(saveErr.message)
          ? "The check-in journey needs the latest update (migration 0065)."
          : saveErr.message,
      );
    return { ok: true, own };
  });

/** Latchkey admin: the starting journey and the steps required or removed for everyone. */
export const getCheckinFlowPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { data, error } = await (
      await admin()
    )
      .from("site_settings")
      .select("checkin_flow")
      .eq("id", 1)
      .maybeSingle();
    return { available: !error, policy: normalisePolicy(error ? null : data?.checkin_flow) };
  });

export const saveCheckinFlowPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ defaults: choices, required: stepList, removed: stepList }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const policy = normalisePolicy(data);
    const { error } = await (context.supabase as unknown as Loose)
      .from("site_settings")
      .update({ checkin_flow: policy, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    const { forgetFlowPolicy } = await import("./checkin-flow.server");
    forgetFlowPolicy();
    return { ok: true, policy };
  });
