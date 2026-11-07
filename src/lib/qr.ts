/**
 * QR codes drawn as see-through SVG: only the dark squares, filled with
 * currentColor, so a code on a screen takes the colour of the text around it
 * and shows the screen's own background between its squares. Printed cards
 * keep black on white (they use qrcode's PNG directly).
 */

/** The squares of a QR code, as qrcode's create() gives them (row by row, 1 = dark). */
export type QrModules = { size: number; data: ArrayLike<number | boolean> };

/** One path for every dark square, merging each row's runs; `margin` quiet squares round the edge. */
export function qrPath(m: QrModules, margin = 1): { size: number; d: string } {
  const parts: string[] = [];
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.data[y * m.size + x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < m.size && m.data[y * m.size + x + run]) run++;
      parts.push(`M${x + margin} ${y + margin}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return { size: m.size + margin * 2, d: parts.join("") };
}

/** The whole <svg> as text (the lite kiosk, which draws plain HTML). */
export function qrSvgText(m: QrModules, margin = 1): string {
  const { size, d } = qrPath(m, margin);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/></svg>`;
}
