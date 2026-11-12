/**
 * Property information (properties.property_info, migration 0109): the host's short items guests
 * may need (bins, parking, heating, the washing machine…), each an icon and a title that open to
 * notes, a few labelled fields and photos. Shown as one card in the stay and room guides, a grid
 * of icons that reveal each item in turn. Photos live in the private "guides" bucket and are
 * shown through short-lived signed links. Pure; tested in tests/guest-guide-extras.test.ts.
 */

export const INFO_ICONS = [
  "info",
  "parking",
  "bins",
  "heating",
  "water",
  "washer",
  "kitchen",
  "coffee",
  "tv",
  "shower",
  "bed",
  "key",
  "safety",
  "first_aid",
  "fire",
  "phone",
  "clock",
  "noise",
  "smoking",
  "pets",
  "bike",
  "car",
  "accessible",
  "luggage",
  "garden",
  "sun",
  "plug",
  "lock",
] as const;
export type InfoIcon = (typeof INFO_ICONS)[number];

export type InfoField = { label: string; value: string };
export type InfoItem = {
  id: string;
  icon: InfoIcon;
  title: string;
  /** Formatted text (rich-text.ts marks). */
  notes: string;
  fields: InfoField[];
  /** Private "guides" bucket paths. */
  images: string[];
};

export const MAX_INFO_ITEMS = 24;
export const MAX_INFO_FIELDS = 12;
export const MAX_INFO_IMAGES = 6;

const clean = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex -- strips control characters except new lines
        .replace(/[\u0000-\u0009\u000b-\u001f]/g, "")
        .trim()
        .slice(0, max)
    : "";

/** The host's items from storage, made safe: known icons, short text, at most so many of each. */
export function normalisePropertyInfo(raw: unknown, propertyId?: string): InfoItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InfoItem[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const title = clean(o["title"], 60);
    if (!title) continue;
    let id = typeof o["id"] === "string" && /^[a-z0-9-]{4,40}$/.test(o["id"]) ? o["id"] : "";
    if (!id || seen.has(id))
      id = `info-${out.length}-${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 20)}`;
    seen.add(id);
    const fields = (Array.isArray(o["fields"]) ? o["fields"] : [])
      .map((f) => {
        const r = (f ?? {}) as Record<string, unknown>;
        return { label: clean(r["label"], 40), value: clean(r["value"], 200) };
      })
      .filter((f) => f.label || f.value)
      .slice(0, MAX_INFO_FIELDS);
    const images = (Array.isArray(o["images"]) ? o["images"] : [])
      .filter(
        (p): p is string =>
          typeof p === "string" &&
          /^[0-9a-f-]{36}\/info\/[a-z0-9-]+\.(jpg|png|webp)$/i.test(p) &&
          (!propertyId || p.startsWith(`${propertyId}/`)),
      )
      .slice(0, MAX_INFO_IMAGES);
    out.push({
      id,
      icon: (INFO_ICONS as readonly string[]).includes(o["icon"] as string)
        ? (o["icon"] as InfoIcon)
        : "info",
      title,
      notes: clean(o["notes"], 2000),
      fields,
      images,
    });
    if (out.length >= MAX_INFO_ITEMS) break;
  }
  return out;
}

/** The items as plain lines, for the receptionist and search. */
export function infoText(items: InfoItem[]): string {
  return items
    .map((i) =>
      [
        `${i.title}:`,
        i.fields.map((f) => `${f.label}${f.label && f.value ? ": " : ""}${f.value}`).join("; "),
        i.notes.replace(/[*_#|-]+/g, " ").replace(/\s+/g, " "),
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}
