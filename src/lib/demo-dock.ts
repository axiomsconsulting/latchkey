/**
 * The demo panel (DemoDock): a small tab attached to the left or right edge
 * of the screen, measured from the bottom, which opens the panel beside it.
 * Dragged anywhere, it snaps back to the nearer side. Kept fully on screen
 * whatever the window does. Pure.
 */
export type DockSide = "left" | "right";
export type DockPos = { side: DockSide; bottom: number };

/** In the bottom-right corner; above the phone's bottom bar on narrow screens. */
export function defaultDock(viewportWidth: number, mode: "host" | "guest"): DockPos {
  const phone = viewportWidth < 768;
  return { side: "right", bottom: phone && mode === "host" ? 104 : 16 };
}

/** Never off the top or bottom, never under the edge. */
export function clampBottom(
  bottom: number,
  height: number,
  viewportHeight: number,
  margin = 8,
): number {
  const max = Math.max(margin, viewportHeight - height - margin);
  return Math.round(Math.min(max, Math.max(margin, bottom)));
}

/** Let go anywhere: it sticks to the nearer side, at the height it was dropped. */
export function dropDock(
  pointer: { x: number; y: number },
  tabHeight: number,
  viewport: { w: number; h: number },
): DockPos {
  return {
    side: pointer.x < viewport.w / 2 ? "left" : "right",
    bottom: clampBottom(viewport.h - pointer.y - tabHeight / 2, tabHeight, viewport.h),
  };
}

/** A press that moved less than this is a tap (open or close), not a drag. */
export const DRAG_SLOP = 6;
export const isDrag = (dx: number, dy: number) => Math.hypot(dx, dy) > DRAG_SLOP;

/** What the browser remembered; the older corner-panel shape ({ right, bottom }) counts as the right side. */
export function readDock(raw: string | null): DockPos | null {
  try {
    const r = raw ? (JSON.parse(raw) as { side?: unknown; bottom?: unknown }) : {};
    if (typeof r.bottom !== "number" || !Number.isFinite(r.bottom)) return null;
    return { side: r.side === "left" ? "left" : "right", bottom: r.bottom };
  } catch {
    return null;
  }
}
