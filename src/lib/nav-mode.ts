/**
 * Desktop menu layouts: the full sidebar, an icon rail, or a bar along the
 * top. The grab bar on the sidebar's edge snaps between them. Pure, so it
 * can be unit tested.
 */

export type NavMode = "full" | "rail" | "top";

export const NAV_MODES: NavMode[] = ["full", "rail", "top"];
export const NAV_WIDTH: Record<Exclude<NavMode, "top">, number> = { full: 256, rail: 88 };

/** Where a drag of the grab bar lands, from the sidebar's width when let go. */
export function modeForWidth(width: number): NavMode {
  if (width >= (NAV_WIDTH.full + NAV_WIDTH.rail) / 2) return "full";
  if (width >= NAV_WIDTH.rail / 2) return "rail";
  return "top";
}

/** One step smaller (arrow left, or a tap that cycles round) or larger. */
export function stepMode(mode: NavMode, dir: "smaller" | "larger"): NavMode {
  const i = NAV_MODES.indexOf(mode);
  return dir === "smaller" ? NAV_MODES[Math.min(i + 1, 2)]! : NAV_MODES[Math.max(i - 1, 0)]!;
}

export function cycleMode(mode: NavMode): NavMode {
  return NAV_MODES[(NAV_MODES.indexOf(mode) + 1) % NAV_MODES.length]!;
}

export function readNavMode(raw: string | null | undefined): NavMode {
  return NAV_MODES.includes(raw as NavMode) ? (raw as NavMode) : "full";
}
