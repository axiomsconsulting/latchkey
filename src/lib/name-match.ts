/**
 * Compares the name read from a photo ID with the booking name. Tolerant of
 * case, accents, punctuation, word order, extra middle names, hyphenated
 * names written with or without the hyphen, a missing surname (sites often
 * hold only the given names) and a one-letter misread in a long name.
 */

export type NameMatch = "matched" | "partial" | "not_matched";

function plain(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ");
}

/** The words of a name, a hyphenated or apostrophe name kept whole ("jannatmariah", "oneill"). */
export function nameTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return plain(raw)
    .replace(/['-]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** One word of a name: whole, and its parts ("jannat-mariah" → jannat, mariah). */
type Word = { whole: string; parts: string[] };

function words(raw: string | null | undefined): Word[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: Word[] = [];
  for (const w of plain(raw).split(/\s+/)) {
    const parts = w.split(/['-]+/).filter((p) => p.length > 0);
    const whole = parts.join("");
    if (!whole || seen.has(whole)) continue;
    seen.add(whole);
    out.push({ whole, parts });
  }
  return out;
}

/** At most one letter added, dropped or changed (a misread, or Mohammed / Mohammad). */
function nearly(a: string, b: string): boolean {
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function compareNames(
  bookingName: string | null | undefined,
  idName: string | null | undefined,
): NameMatch {
  const booked = words(bookingName);
  const onId = words(idName);
  if (booked.length === 0 || onId.length === 0) return "not_matched";
  // Every way the ID's words can be written: whole, each part, and neighbours run together.
  const forms = new Set<string>();
  for (const w of onId) {
    forms.add(w.whole);
    for (const p of w.parts) forms.add(p);
  }
  for (let i = 0; i + 1 < onId.length; i++) forms.add(onId[i]!.whole + onId[i + 1]!.whole);
  const list = [...forms];

  const found = (w: Word): boolean => {
    if (w.whole.length === 1) return list.some((f) => f.startsWith(w.whole));
    if (forms.has(w.whole) || w.parts.every((p) => forms.has(p))) return true;
    return list.some((f) => nearly(f, w.whole));
  };

  const hits = booked.map(found);
  const real = booked.filter((w, i) => hits[i] && w.whole.length > 1).length;
  if (booked.length === 1) return real === 1 ? "partial" : "not_matched";
  const firstOk = hits[0]!;
  const lastOk = hits[hits.length - 1]!;
  // Every booked name on the ID (in any order), or the first and last; at least one more than an initial.
  if (real >= 1 && (hits.every(Boolean) || (firstOk && lastOk))) return "matched";
  return real >= 1 ? "partial" : "not_matched";
}
