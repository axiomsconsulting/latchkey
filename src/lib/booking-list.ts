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
  notes?: string | null;
};

/** Where a stay sits for the host, in the order they care about. */
export type StayGroup =
  "here" | "arriving" | "leaving" | "upcoming" | "attention" | "past" | "cancelled" | "closed";

export const GROUP_ORDER: StayGroup[] = [
  "here",
  "arriving",
  "leaving",
  "upcoming",
  "attention",
  "past",
  "cancelled",
  "closed",
];

/** Shown unless the host ticks them: past stays. */
export const HIDDEN_BY_DEFAULT: StayGroup[] = ["past"];

export function stayGroup(b: ListBooking, today: string): StayGroup {
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "blocked" || b.mirror_of) return "closed";
  if (b.status === "checked_out" || b.check_out_date < today) return "past";
  if (b.check_out_date === today) return "leaving";
  if (b.status === "checked_in") return "here";
  if (b.status === "needs_details" || b.status === "flagged") return "attention";
  if (b.check_in_date <= today) return "arriving";
  return "upcoming";
}

export type SortKey =
  "smart" | "guest" | "room" | "checkIn" | "checkOut" | "nights" | "platform" | "status" | "amount";

export function nights(b: ListBooking): number {
  return Math.max(
    0,
    Math.round((Date.parse(b.check_out_date) - Date.parse(b.check_in_date)) / 86_400_000),
  );
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
  const byDate =
    a.check_in_date.localeCompare(b.check_in_date) ||
    a.check_out_date.localeCompare(b.check_out_date);
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
    room: (a, b) =>
      label.room(a.room_id).localeCompare(label.room(b.room_id), "en-GB", { numeric: true }),
    checkIn: (a, b) => a.check_in_date.localeCompare(b.check_in_date),
    checkOut: (a, b) => a.check_out_date.localeCompare(b.check_out_date),
    nights: (a, b) => nights(a) - nights(b),
    platform: (a, b) => label.platform(a).localeCompare(label.platform(b)),
    status: (a, b) =>
      GROUP_ORDER.indexOf(stayGroup(a, today)) - GROUP_ORDER.indexOf(stayGroup(b, today)),
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

export const DEFAULT_FILTERS: ListFilters = {
  search: "",
  hideGroups: [...HIDDEN_BY_DEFAULT],
  hideRooms: [],
  hidePlatforms: [],
};

/**
 * Closed nights the site has since opened again (a nameless calendar entry
 * that left the feed): nothing was booked, so it isn't a cancelled stay.
 * Booking.com's rolling "closed beyond the booking window" blocks end up here
 * every day.
 */
export function liftedBlock(b: ListBooking): boolean {
  return b.status === "cancelled" && !b.guest_full_name && !b.reservation_code;
}

export function filterBookings(
  list: ListBooking[],
  f: ListFilters,
  today: string,
  platform: (b: ListBooking) => string,
): ListBooking[] {
  const q = f.search.trim().toLocaleLowerCase("en-GB");
  return list.filter((b) => {
    if (liftedBlock(b)) return false;
    if (f.hideGroups.includes(stayGroup(b, today))) return false;
    if (f.hideRooms.includes(b.room_id ?? "none")) return false;
    if (f.hidePlatforms.includes(platform(b))) return false;
    if (!q) return true;
    return (
      (b.guest_full_name ?? "").toLocaleLowerCase("en-GB").includes(q) ||
      (b.reservation_code ?? "").toLocaleLowerCase("en-GB").includes(q)
    );
  });
}

/** Reads saved filters, ignoring anything that no longer makes sense. */
export function readFilters(raw: string | null): ListFilters {
  try {
    const v = JSON.parse(raw ?? "") as Partial<ListFilters>;
    const strings = (x: unknown) =>
      Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, 100) : [];
    return {
      search: "",
      hideGroups: strings(v.hideGroups).filter((g): g is StayGroup =>
        GROUP_ORDER.includes(g as StayGroup),
      ),
      hideRooms: strings(v.hideRooms),
      hidePlatforms: strings(v.hidePlatforms),
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

/**
 * Why a night is closed, in place of a guest name: the stay it mirrors on
 * another site, or a block from the calendar (with the host's own note).
 */
export function closedReason(
  b: ListBooking,
  all: ListBooking[],
  platform: (b: ListBooking) => string,
): string {
  if (b.mirror_of) {
    const original = all.find((x) => x.id === b.mirror_of);
    if (original) {
      const who = original.guest_full_name?.trim();
      return `Booked on ${platform(original)}${who ? ` · ${who}` : ""}`;
    }
    return "Booked on another site";
  }
  const note = b.notes?.trim();
  return note ? `Blocked: ${note.split("\n")[0]!.slice(0, 80)}` : `Blocked on ${platform(b)}`;
}

/**
 * The short line beside a closed night's icons: the host's own note, or who
 * the nights belong to on the other site. Empty when there's nothing to add
 * (the status icon already says it's closed, and the platform icon where).
 */
export function closedNote(
  b: ListBooking,
  all: ListBooking[],
  platform: (b: ListBooking) => string,
): string {
  if (b.mirror_of) {
    const original = all.find((x) => x.id === b.mirror_of);
    return original?.guest_full_name?.trim() || (original ? platform(original) : "");
  }
  return b.notes?.trim().split("\n")[0]!.slice(0, 80) ?? "";
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Arrival and departure in one short line: "Wed 14 – Sun 18 Oct",
 * "Wed 28 Oct – Mon 2 Nov", with the year only when it isn't this year.
 */
export function stayDates(checkIn: string, checkOut: string, today: string): string {
  const parts = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth(),
      day: d.getUTCDate(),
      dow: DAY[d.getUTCDay()]!,
    };
  };
  const a = parts(checkIn);
  const b = parts(checkOut);
  const thisYear = Number(today.slice(0, 4));
  const yearB = b.y !== thisYear || a.y !== b.y ? ` ${b.y}` : "";
  const yearA = a.y !== b.y ? ` ${a.y}` : "";
  if (a.y === b.y && a.m === b.m)
    return `${a.dow} ${a.day} – ${b.dow} ${b.day} ${MONTH[b.m]}${yearB}`;
  return `${a.dow} ${a.day} ${MONTH[a.m]}${yearA} – ${b.dow} ${b.day} ${MONTH[b.m]}${yearB}`;
}
