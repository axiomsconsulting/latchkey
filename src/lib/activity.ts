/**
 * Turns audit_log rows into plain lines for the Activity page. Pure, so the
 * wording is tested; redacted values never show, only that they changed.
 */

export const REDACTED = "[redacted]";

/** Columns that say which thing a row is, in the order worth showing. */
const NAME_KEYS = [
  "display_name",
  "name",
  "business_name",
  "title",
  "listing_name",
  "heading",
  "section_key",
  "room_number",
];

export type FieldChange = {
  field: string;
  from: string | null;
  to: string | null;
  hidden: boolean;
};

function show(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** "check_in_pin" → "check in pin". */
export function fieldLabel(key: string): string {
  return key.replace(/_id$/, "").replace(/_/g, " ");
}

/** What the row was called, when it has a readable name. */
export function rowName(changed: Record<string, unknown> | null): string | null {
  if (!changed) return null;
  for (const key of NAME_KEYS) {
    const raw = changed[key];
    const value =
      raw && typeof raw === "object" && "new" in raw ? (raw as { new: unknown }).new : raw;
    if (typeof value === "string" && value && value !== REDACTED) return value;
  }
  return null;
}

/** Field-by-field changes of an update, without ids. */
export function fieldChanges(
  action: string,
  changed: Record<string, unknown> | null,
): FieldChange[] {
  if (action !== "update" || !changed) return [];
  return Object.entries(changed)
    .filter(([key]) => key !== "id" && !key.endsWith("_id"))
    .map(([key, v]) => {
      const pair = (v ?? {}) as { old?: unknown; new?: unknown };
      const hidden = pair.old === REDACTED || pair.new === REDACTED;
      return {
        field: fieldLabel(key),
        from: hidden ? null : show(pair.old),
        to: hidden ? null : show(pair.new),
        hidden,
      };
    });
}
