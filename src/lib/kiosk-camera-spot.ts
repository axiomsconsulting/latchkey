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

export type PreviewPlace = {
  /** The preview comes before the buttons: left on its side, above when upright. */
  first: boolean;
  /** On its side, how high in the screen. */
  align: "start" | "center" | "end";
};

/** Where the preview goes for a camera there. A camera in the middle leaves the usual layout. */
export function previewPlace(s: Spot, way: WayUp): PreviewPlace {
  if (way === "portrait") return { first: s.y <= 0.5, align: "center" };
  return {
    first: s.x <= 0.5,
    align: s.y < 0.3 ? "start" : s.y > 0.7 ? "end" : "center",
  };
}
