/**
 * Settings a Latchkey admin changed on a shared demo property, kept across its daily rebuild
 * (migration 0094). Pure; tested in tests/demo-defaults.test.ts.
 */

/** Never carried over: these belong to the rebuilt row itself. */
const OWN_TO_THE_ROW = new Set([
  "id",
  "host_id",
  "short_code",
  "is_demo",
  "created_at",
  "check_in_pin",
  "kiosk_cards_at",
  "trades_ai_at",
]);

/** The rebuilt property: its standard set-up, with what the admin changed on top. */
export function withDemoDefaults<T extends Record<string, unknown>>(
  base: T,
  saved: unknown,
): T & Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  if (saved && typeof saved === "object" && !Array.isArray(saved)) {
    for (const [k, v] of Object.entries(saved)) {
      if (!OWN_TO_THE_ROW.has(k)) out[k] = v;
    }
  }
  return out as T & Record<string, unknown>;
}

/** "kiosk_rest" to "Kiosk rest", for the list in Latchkey admin. */
export const settingLabel = (key: string) => {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
