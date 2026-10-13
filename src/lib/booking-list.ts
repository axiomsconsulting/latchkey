/**
 * The bookings table: which group a stay belongs to, the host-friendly
 * default order, column sorting and show/hide filters. Pure, so it can be
 * unit tested.
 */

export type ListBooking = {
  id: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  guest_full_name: string | null;
  reservation_code?: string | null;
  room_id: string | null;
  channel: string;
  site_key?: string | null;
  mirror_of?: string | null;
  guest_count?: number | null;
  stay_amount_pence?: number | null;
};

/** Where a stay sits for the host, in the order they care about. */
export type StayGroup = "here" | "arriving" | "leaving" | "upcoming" | "attention" | "past" | "cancelled" | "closed";

export const GROUP_ORDER: StayGroup[] = ["here", "arriving", "leaving", "upcoming", "attention", "past", "cancelled", "closed"];

/** Shown unless the host ticks them: past stays. */
export const HIDDEN_BY_DEFAULT: StayGroup[] = ["past"];

export function stayGroup(b: ListBooking, today: string): StayGroup {
  if (b.status === "blocked" || b.mirror_of) return "closed";
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "checked_out" || b.check_out_date < today) return "past";
  if (b.check_out_date === today) return "leaving";
  if (b.status === "checked_in") return "here";
  if (b.status === "needs_details" || b.status === "flagged") return "attention";
  if (b.check_in_date <= today) return "arriving";
  return "upcoming";
}

export type SortKey = "smart" | "guest" | "room" | "checkIn" | "checkOut" | "nights" | "platform" | "status" | "amount";

export function nights(b: ListBooking): number {
  return Math.max(0, Math.round((Date.parse(b.check_out_date) - Date.parse(b.check_in_date)) / 86_400_000));
}

/**
 * The default order: grouped as above, soonest first for what's ahead and
 * most recent first for what's behind.
 */
function smartCompare(a: ListBooking, b: ListBooking, today: string): number {
  const ga = GROUP_ORDER.indexOf(stayGroup(a, today));
  const gb = GROUP_ORDER.indexOf(stayGroup(b, today));
  if (ga !== gb) return ga - gb;
  const behind = ["past", "cancelled", "closed"].includes(stayGroup(a, today));
  const byDate = a.check_in_date.localeCompare(b.check_in_date) || a.check_out_date.localeCompare(b.check_out_date);
  return behind ? -byDate : byDate;
}

export function sortBookings(
  list: ListBooking[],
  key: SortKey,
  dir: "asc" | "desc",
  today: string,
  label: { room: (id: string | null) => string; platform: (b: ListBooking) => string },
): ListBooking[] {
  const text = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase("en-GB");
  const cmp: Record<SortKey, (a: ListBooking, b: ListBooking) => number> = {
    smart: (a, b) => smartCompare(a, b, today),
    guest: (a, b) => text(a.guest_full_name).localeCompare(text(b.guest_full_name)),
    room: (a, b) => label.room(a.room_id).localeCompare(label.room(b.room_id), "en-GB", { numeric: true }),
    checkIn: (a, b) => a.check_in_date.localeCompare(b.check_in_date),
    checkOut: (a, b) => a.check_out_date.localeCompare(b.check_out_date),
    nights: (a, b) => nights(a) - nights(b),
    platform: (a, b) => label.platform(a).localeCompare(label.platform(b)),
    status: (a, b) => GROUP_ORDER.indexOf(stayGroup(a, today)) - GROUP_ORDER.indexOf(stayGroup(b, today)),
    amount: (a, b) => (a.stay_amount_pence ?? -1) - (b.stay_amount_pence ?? -1),
  };
  const sign = key === "smart" || dir === "asc" ? 1 : -1;
  // Ties fall back to the default order, so the list never looks random.
  return [...list].sort((a, b) => sign * cmp[key](a, b) || smartCompare(a, b, today));
}

export type ListFilters = {
  search: string;
  /** Hidden groups, rooms and platforms; empty means show everything. */
  hideGroups: StayGroup[];
  hideRooms: string[];
  hidePlatforms: string[];
};

export const DEFAULT_FILTERS: ListFilters = { search: "", hideGroups: [...HIDDEN_BY_DEFAULT], hideRooms: [], hidePlatforms: [] };

export function filterBookings(list: ListBooking[], f: ListFilters, today: string, platform: (b: ListBooking) => string): ListBooking[] {
  const q = f.search.trim().toLocaleLowerCase("en-GB");
  return list.filter((b) => {
    if (f.hideGroups.includes(stayGroup(b, today))) return false;
    if (f.hideRooms.includes(b.room_id ?? "none")) return false;
    if (f.hidePlatforms.includes(platform(b))) return false;
    if (!q) return true;
    return (
      (b.guest_full_name ?? "").toLocaleLowerCase("en-GB").includes(q) || (b.reservation_code ?? "").toLocaleLowerCase("en-GB").includes(q)
    );
  });
}

/** Reads saved filters, ignoring anything that no longer makes sense. */
export function readFilters(raw: string | null): ListFilters {
  try {
    const v = JSON.parse(raw ?? "") as Partial<ListFilters>;
    const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, 100) : []);
    return {
      search: "",
      hideGroups: strings(v.hideGroups).filter((g): g is StayGroup => GROUP_ORDER.includes(g as StayGroup)),
      hideRooms: strings(v.hideRooms),
      hidePlatforms: strings(v.hidePlatforms),
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}
