import { describe, expect, it } from "vitest";
import QRCode from "qrcode";

import { qrPath, qrSvgText } from "@/lib/qr";

describe("qrPath", () => {
  it("merges each row's dark squares into runs, inside the quiet edge", () => {
    // 3x3: row 0 = dark dark light, row 1 = light, row 2 = dark light dark
    const m = { size: 3, data: [1, 1, 0, 0, 0, 0, 1, 0, 1] };
    expect(qrPath(m, 1)).toEqual({ size: 5, d: "M1 1h2v1h-2zM1 3h1v1h-1zM3 3h1v1h-1z" });
  });

  it("draws a real code with no background, in the text colour", () => {
    const q = QRCode.create("https://example.com/g/hill-otter-amber", {
      errorCorrectionLevel: "M",
    });
    const svg = qrSvgText(q.modules);
    expect(svg).toContain('fill="currentColor"');
    expect(svg).not.toMatch(/#fff|white/i);
    expect(svg).toContain(`viewBox="0 0 ${q.modules.size + 2} ${q.modules.size + 2}"`);
    // Every dark square is drawn once.
    const dark = Array.from(q.modules.data).filter(Boolean).length;
    const drawn = [...svg.matchAll(/h(\d+)v1/g)].reduce((n, r) => n + Number(r[1]), 0);
    expect(drawn).toBe(dark);
  });
});
