/**
 * A host trying their own check-in. It behaves like a guest's stay, but never holds a room (see
 * migration 0092) and can be wiped whole. Pure; the server side is test-stay.server.ts.
 */
import { addDays } from "./dates";

/** A test stay is removed by itself this long after its check-out, if nobody resets it. */
export const TEST_KEEP_DAYS = 7;

export const testStayNote = (name: string) =>
  `Test check-in by ${name}. Not a real guest. It doesn't block any room or show on any calendar. Use Reset on Today to remove it and everything it saved.`;

/** Tonight only: arrives today, leaves tomorrow. */
export const testStayDates = (today: string) => ({
  check_in_date: today,
  check_out_date: addDays(today, 1),
});

/** A full name for the register and for matching their own ID: two words at least. */
export function testNameProblem(name: string): boolean {
  return name.trim().replace(/\s+/g, " ").split(" ").length < 2;
}

/** From what sign-in knows: a name if there is one, else nothing for them to replace. */
export function suggestedName(meta: Record<string, unknown> | null | undefined): string {
  const v = meta?.["full_name"] ?? meta?.["name"];
  return typeof v === "string" ? v.trim().slice(0, 120) : "";
}

/** The surname's first letter, which the kiosk asks for. */
export function surnameLetter(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").charAt(0).toUpperCase();
}
