/**
 * The UK register on a door tablet: one question per page on Jumbo screens
 * (nothing to scroll), and nationality picked by tapping first letters, with
 * each country's flag, instead of a long drop-down list.
 */

export type RegisterPage =
  "name" | "nationality" | "document" | "place" | "destination" | "address";
type Problem = "name" | "nationality" | "document" | "place" | "destination";

/** The pages to show, in order: only what's asked, and an alien's details once that nationality is picked. */
export function registerPages(
  show: (k: "name" | "nationality" | "document" | "place" | "destination") => boolean,
  alien: boolean,
): RegisterPage[] {
  const pages: RegisterPage[] = [];
  if (show("name")) pages.push("name");
  if (show("nationality")) pages.push("nationality");
  if (alien) {
    if (show("document")) pages.push("document");
    if (show("place")) pages.push("place");
    if (show("destination")) pages.push("destination", "address");
  }
  return pages;
}

/** A page can move on once its own answer is there (the address is optional). */
export function pageReady(page: RegisterPage, missing: readonly Problem[]): boolean {
  return page === "address" || !missing.includes(page);
}

/** The flag for a nationality code (British statuses get the UK's); a white flag when unknown. */
export function flagEmoji(code: string): string {
  const cc = code.startsWith("GB") ? "GB" : code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || cc === "XX") return "🏳️";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** A name as typed on the letter keys: capitals and single spaces, accents and marks dropped. */
export function countryKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[-–—/]/g, " ")
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type Narrowed<T> = {
  /** Countries starting with what's been tapped. */
  matches: T[];
  /** The letters (or " ") that can come next, A to Z with space last. */
  next: string[];
};

/** Countries starting with the letters tapped so far, and the keys that still lead somewhere. */
export function narrowCountries<T extends { name: string }>(
  options: readonly T[],
  typed: string,
): Narrowed<T> {
  const prefix = countryKey(typed) + (typed.endsWith(" ") && typed.trim() ? " " : "");
  const matches = options.filter((o) => countryKey(o.name).startsWith(prefix));
  const next = new Set<string>();
  for (const o of matches) {
    const ch = countryKey(o.name)[prefix.length];
    if (ch) next.add(ch);
  }
  const keys = [...next].sort((a, b) => (a === " " ? 1 : b === " " ? -1 : a.localeCompare(b)));
  return { matches, next: keys };
}

/** Few enough to show as buttons (they fit a Jumbo card without scrolling). */
export const SHOW_MATCHES = 8;
