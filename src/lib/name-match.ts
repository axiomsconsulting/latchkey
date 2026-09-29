/**
 * Compares the name read from a photo ID with the booking name. Tolerant of
 * case, accents, punctuation, word order and extra middle names.
 */

export type NameMatch = "matched" | "partial" | "not_matched";

export function nameTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/['-]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function compareNames(bookingName: string | null | undefined, idName: string | null | undefined): NameMatch {
  const booked = nameTokens(bookingName);
  const onId = new Set(nameTokens(idName));
  if (booked.length === 0 || onId.size === 0) return "not_matched";

  const first = booked[0]!;
  const last = booked[booked.length - 1]!;
  const firstOk = onId.has(first) || (first.length === 1 && [...onId].some((t) => t.startsWith(first)));
  const lastOk = onId.has(last);

  if (booked.length === 1) return onId.has(first) ? "partial" : "not_matched";
  if (firstOk && lastOk) return "matched";
  if (lastOk || firstOk) return "partial";
  return "not_matched";
}
