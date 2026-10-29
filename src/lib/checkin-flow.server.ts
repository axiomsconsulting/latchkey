/* eslint-disable @typescript-eslint/no-explicit-any -- reads columns the generated Supabase types don't cover yet */
/**
 * The check-in journey on the server: Latchkey admin's policy
 * (site_settings.checkin_flow, read with the service role and cached for a
 * minute) applied to a property's own journey, and the older switches
 * (checkin_methods, guest_records) patched to match, so every rule that
 * reads them follows the journey (src/lib/checkin-flow.ts).
 */
import {
  effectiveFlow,
  fromLegacy,
  normaliseFlow,
  normalisePolicy,
  toMethods,
  toRecords,
  type FlowChoices,
  type FlowPolicy,
} from "./checkin-flow";
import { normaliseMethods } from "./checkin-logic";
import { normaliseRecords } from "./guest-records";
import { registerApplies } from "./hotel-register";

let cached: { at: number; policy: FlowPolicy } | null = null;

export async function flowPolicy(fresh = false): Promise<FlowPolicy> {
  if (!fresh && cached && Date.now() - cached.at < 60_000) return cached.policy;
  const { admin } = await import("./checkin.server");
  const db = (await admin()) as any;
  const { data, error } = await db
    .from("site_settings")
    .select("checkin_flow")
    .eq("id", 1)
    .maybeSingle();
  const policy = normalisePolicy(error ? null : data?.checkin_flow);
  cached = { at: Date.now(), policy };
  return policy;
}

/** After Latchkey admin saves, the next read is fresh. */
export function forgetFlowPolicy() {
  cached = null;
}

type FlowRow = {
  checkin_methods?: unknown;
  guest_records?: unknown;
  /** undefined: the database hasn't the column yet; null: follows Latchkey's start. */
  checkin_flow?: unknown;
  country_code?: string | null;
};

/** The property's own journey (before Latchkey's rules), or null when it follows the starting one. */
export function ownFlow(p: FlowRow, policy: FlowPolicy): FlowChoices | null {
  if (p.checkin_flow === undefined)
    return fromLegacy(
      normaliseMethods(p.checkin_methods),
      p.guest_records === undefined ? null : normaliseRecords(p.guest_records),
    );
  return p.checkin_flow === null ? null : normaliseFlow(p.checkin_flow, policy.defaults);
}

/** The property with its journey as it runs, and the older switches patched to match. */
export async function withFlow<T extends FlowRow>(p: T): Promise<T & { flow: FlowChoices }> {
  const policy = await flowPolicy();
  const flow = effectiveFlow(ownFlow(p, policy), policy, { uk: registerApplies(p.country_code) });
  return {
    ...p,
    checkin_methods: toMethods(flow),
    // Left out when the database hasn't guest_records yet: nothing new is asked then.
    ...(p.guest_records === undefined
      ? {}
      : { guest_records: toRecords(flow, normaliseRecords(p.guest_records)) }),
    flow,
  };
}
