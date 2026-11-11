/**
 * A wavy outline round a rounded rectangle (the voice-driven Check in button): the
 * rectangle's edge with a sine wave along it, a whole number of waves so it closes
 * without a seam. `phase` (radians) moves the waves round. Pure, so it can be tested.
 */
export function wavyPath(
  w: number,
  h: number,
  radius: number,
  amp: number,
  wave: number,
  phase: number,
  step = 4,
): string {
  if (w <= 0 || h <= 0) return "";
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const straightX = w - 2 * r;
  const straightY = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  const perimeter = 2 * straightX + 2 * straightY + 4 * arc;
  const waves = Math.max(1, Math.round(perimeter / Math.max(1, wave)));
  const at = (s: number): { x: number; y: number; nx: number; ny: number } => {
    // Clockwise from the top edge's left end.
    const corner = (cx: number, cy: number, from: number, d: number) => {
      const a = from + d / Math.max(r, 1e-6);
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) };
    };
    if (s < straightX) return { x: r + s, y: 0, nx: 0, ny: -1 };
    s -= straightX;
    if (s < arc) return corner(w - r, r, -Math.PI / 2, s);
    s -= arc;
    if (s < straightY) return { x: w, y: r + s, nx: 1, ny: 0 };
    s -= straightY;
    if (s < arc) return corner(w - r, h - r, 0, s);
    s -= arc;
    if (s < straightX) return { x: w - r - s, y: h, nx: 0, ny: 1 };
    s -= straightX;
    if (s < arc) return corner(r, h - r, Math.PI / 2, s);
    s -= arc;
    if (s < straightY) return { x: 0, y: h - r - s, nx: -1, ny: 0 };
    s -= straightY;
    return corner(r, r, Math.PI, Math.min(s, arc));
  };
  const n = Math.max(24, Math.ceil(perimeter / step));
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const s = (i / n) * perimeter;
    const p = at(s);
    const d = amp * Math.sin((2 * Math.PI * waves * s) / perimeter + phase);
    parts.push(`${i ? "L" : "M"}${(p.x + p.nx * d).toFixed(1)} ${(p.y + p.ny * d).toFixed(1)}`);
  }
  return parts.join("") + "Z";
}
