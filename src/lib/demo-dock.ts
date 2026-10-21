/**
 * The floating demo panel (DemoDock): where it sits, measured from the
 * bottom-right corner, kept fully on screen whatever the window does. Pure.
 */
export type DockPos = { right: number; bottom: number };

/** A little inside the corner; above the phone's bottom bar on narrow screens. */
export function defaultDock(viewportWidth: number, mode: "host" | "guest"): DockPos {
  const phone = viewportWidth < 768;
  return { right: 16, bottom: phone && mode === "host" ? 104 : 16 };
}

/** Never off screen, never under the edge. */
export function clampDock(p: DockPos, size: { w: number; h: number }, viewport: { w: number; h: number }, margin = 8): DockPos {
  const maxRight = Math.max(margin, viewport.w - size.w - margin);
  const maxBottom = Math.max(margin, viewport.h - size.h - margin);
  return {
    right: Math.round(Math.min(maxRight, Math.max(margin, p.right))),
    bottom: Math.round(Math.min(maxBottom, Math.max(margin, p.bottom))),
  };
}

/** Dragging by (dx, dy) pixels: right and bottom shrink as the panel moves right and down. */
export function moveDock(start: DockPos, dx: number, dy: number): DockPos {
  return { right: start.right - dx, bottom: start.bottom - dy };
}

export function readDock(raw: string | null): { pos: DockPos | null; collapsed: boolean } {
  try {
    const r = raw ? (JSON.parse(raw) as { right?: unknown; bottom?: unknown; collapsed?: unknown }) : {};
    const pos = typeof r.right === "number" && typeof r.bottom === "number" && Number.isFinite(r.right) && Number.isFinite(r.bottom) ? { right: r.right, bottom: r.bottom } : null;
    return { pos, collapsed: r.collapsed === true };
  } catch {
    return { pos: null, collapsed: false };
  }
}
