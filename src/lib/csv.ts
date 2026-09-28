/** Minimal RFC 4180 CSV reader used by the booking importer. */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const IMPORT_FIELDS = [
  { key: "guest_full_name", label: "Guest name" },
  { key: "check_in_date", label: "Check-in date" },
  { key: "check_out_date", label: "Check-out date" },
  { key: "room", label: "Room" },
  { key: "channel", label: "Channel" },
  { key: "reservation_code", label: "Booking reference" },
  { key: "guest_count", label: "Guests" },
  { key: "phone_last4", label: "Phone last 4" },
  { key: "notes", label: "Notes" },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

/** Guesses which column holds which field from the header row. */
export function guessMapping(headers: string[]): Partial<Record<ImportFieldKey, number>> {
  const guess: Partial<Record<ImportFieldKey, number>> = {};
  headers.forEach((h, i) => {
    const key = h.toLowerCase().replace(/[^a-z]/g, "");
    if (/guestname|name|guest$/.test(key) && guess.guest_full_name === undefined)
      guess.guest_full_name = i;
    else if (/(checkin|arrival|from|startdate|start)/.test(key) && guess.check_in_date === undefined)
      guess.check_in_date = i;
    else if (/(checkout|departure|to|enddate|end)/.test(key) && guess.check_out_date === undefined)
      guess.check_out_date = i;
    else if (/room/.test(key) && guess.room === undefined) guess.room = i;
    else if (/(channel|source|platform)/.test(key) && guess.channel === undefined) guess.channel = i;
    else if (/(reference|code|confirmation|booking)/.test(key) && guess.reservation_code === undefined)
      guess.reservation_code = i;
    else if (/(guests|people|pax|adults)/.test(key) && guess.guest_count === undefined)
      guess.guest_count = i;
    else if (/phone/.test(key) && guess.phone_last4 === undefined) guess.phone_last4 = i;
    else if (/note/.test(key) && guess.notes === undefined) guess.notes = i;
  });
  return guess;
}

/** Accepts 2026-04-01, 01/04/2026 and 1 Apr 2026. Returns ISO or null. */
export function normaliseDate(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (uk) {
    const [, d, m, y] = uk;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const parsed = Date.parse(`${v} UTC`);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}
