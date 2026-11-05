/**
 * Where a door tablet's front camera sits, so guests look towards it: the photo
 * preview opens on the side of the screen nearest the camera. The host drags a
 * camera icon on a picture of the tablet, for each way up; x and y go 0 to 1 across
 * the screen, and a spot inside the screen (a notch, or a camera under it) is fine.
 * Browsers don't tell a page the make or model, so the suggestion only goes by the
 * kind of device (deviceSignature); a spot set on one tablet is copied to others of
 * that kind. Pure; tested in tests/kiosk-camera-spot.test.ts.
 */

export type Spot = { x: number; y: number };
export type WayUp = "landscape" | "portrait";
export type CameraSpots = Partial<Record<WayUp, Spot>>;

const unit = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;

function spot(raw: unknown): Spot | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const x = unit(r["x"]);
  const y = unit(r["y"]);
  return x === null || y === null
    ? null
    : { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
}

export function normaliseSpots(raw: unknown): CameraSpots {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: CameraSpots = {};
  const l = spot(r["landscape"]);
  const p = spot(r["portrait"]);
  if (l) out.landscape = l;
  if (p) out.portrait = p;
  return out;
}

const TOP_MIDDLE: Spot = { x: 0.5, y: 0 };

/**
 * A starting guess. Nearly every screen has it top middle. Older iPads (up to
 * 810 x 1080) have it on the short edge, so on their side it's at the left when
 * the home button is on the right. Newer iPads can't be told apart by their screen.
 */
export function suggestedSpot(sig: string | null | undefined, way: WayUp): Spot {
  if (way === "portrait") return TOP_MIDDLE;
  const m = /^ipad\|(\d+)x(\d+)/.exec(sig ?? "");
  return m && Number(m[1]) <= 810 && Number(m[2]) <= 1080 ? { x: 0, y: 0.5 } : TOP_MIDDLE;
}

export const spotFor = (spots: CameraSpots, sig: string | null | undefined, way: WayUp): Spot =>
  spots[way] ?? suggestedSpot(sig, way);

export type Rect = { x: number; y: number; w: number; h: number };
export type Edge = "top" | "bottom" | "left" | "right";

export type CameraCallout = {
  /** The floating preview and its button, with the pointer outside it. */
  box: Rect;
  preview: { w: number; h: number };
  /** Which side of the box the pointer leaves from, and how far along that side (px). */
  pointer: { edge: Edge; at: number };
  /** The space left for everything else on the screen. */
  free: Rect;
};

const MARGIN = 10;
/** Room for the pointer and its camera badge between the box and the camera. */
export const POINTER_SPACE = 44;

/**
 * Where the floating preview goes: right up against the camera's nearest edge, with its
 * pointer on the camera, and slid along that edge so what's left of the screen is one good
 * block for everything else. Never leaves the screen, whatever the numbers.
 */
export function cameraCallout(
  s: Spot,
  screen: { w: number; h: number },
  buttonH: number,
): CameraCallout {
  const { w, h } = screen;
  const wide = w >= h;
  const pw = Math.round(
    wide
      ? Math.min(w * 0.46, ((h - buttonH) * 0.6 * 4) / 3)
      : Math.min(w * 0.86, (h * 0.34 * 4) / 3),
  );
  const ph = Math.round((pw * 3) / 4);
  const bw = pw;
  const bh = ph + buttonH;
  const cx = s.x * w;
  const cy = s.y * h;
  const edge = (
    [
      ["top", cy],
      ["bottom", h - cy],
      ["left", cx],
      ["right", w - cx],
    ] as Array<[Edge, number]>
  ).sort((a, b) => a[1] - b[1])[0]![0];
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  let x: number;
  let y: number;
  if (edge === "top" || edge === "bottom") {
    // On a wide screen, off to one side of the camera, leaving a tall block on the other.
    const along = wide ? (s.x >= 0.5 ? 0.2 : 0.8) : 0.5;
    x = cx - bw * along;
    y = edge === "top" ? cy + POINTER_SPACE : cy - POINTER_SPACE - bh;
  } else {
    x = edge === "left" ? cx + POINTER_SPACE : cx - POINTER_SPACE - bw;
    y = wide ? cy - bh / 2 : cy < h / 2 ? cy - bh * 0.2 : cy - bh * 0.8;
  }
  x = Math.round(clamp(x, MARGIN, Math.max(MARGIN, w - bw - MARGIN)));
  y = Math.round(clamp(y, MARGIN, Math.max(MARGIN, h - bh - MARGIN)));
  const box: Rect = { x, y, w: bw, h: bh };
  const blocks: Rect[] = [
    { x: 0, y: 0, w: x, h },
    { x: x + bw, y: 0, w: w - x - bw, h },
    { x: 0, y: 0, w, h: y },
    { x: 0, y: y + bh, w, h: h - y - bh },
  ];
  // The block that suits a column of text and a QR code best.
  const free = blocks.sort(
    (a, b) =>
      Math.min(b.w / 1.2, b.h) * Math.min(b.w, b.h * 1.2) -
      Math.min(a.w / 1.2, a.h) * Math.min(a.w, a.h * 1.2),
  )[0]!;
  const at =
    edge === "top" || edge === "bottom" ? clamp(cx - x, 16, bw - 16) : clamp(cy - y, 16, bh - 16);
  return { box, preview: { w: pw, h: ph }, pointer: { edge, at: Math.round(at) }, free };
}
