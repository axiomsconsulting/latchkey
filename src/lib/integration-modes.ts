/**
 * Each outside integration can run in demo mode (simulated, safe to test) or
 * live mode (real calls, needs setup). The host switches them one by one.
 */

export type Mode = "demo" | "live";
export type IntegrationKey = "contra" | "id_check" | "host_email" | "guest_messages";

export type IntegrationModes = Record<IntegrationKey, Mode>;

export const INTEGRATION_KEYS: IntegrationKey[] = ["contra", "id_check", "host_email", "guest_messages"];

export const DEFAULT_MODES: IntegrationModes = {
  contra: "demo",
  id_check: "live",
  host_email: "demo",
  guest_messages: "demo",
};

export function normaliseModes(raw: unknown): IntegrationModes {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_MODES };
  for (const k of INTEGRATION_KEYS) if (r[k] === "demo" || r[k] === "live") out[k] = r[k];
  return out;
}
