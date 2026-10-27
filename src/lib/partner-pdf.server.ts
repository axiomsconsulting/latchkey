/**
 * Server only: the signed Commission Partner agreement as a PDF (agreement
 * 4.4): the exact text the partner signed, then a signing certificate with
 * the record of clause 4.3 and the drawn signature. Built with pdf-lib and
 * its standard Helvetica, so no font file ships with the app; characters
 * Helvetica can't draw are shown without accents, or as "?" (the signing
 * record in the database keeps the exact typed name).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { parseMarkdown, plain, splitSigning, ukDateTime, type Block } from "./partner-agreement";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0.1, 0.12, 0.11);
const MUTED = rgb(0.38, 0.4, 0.39);

/** Text Helvetica can draw: accents dropped where needed, anything else "?". */
function drawable(font: PDFFont, cache: Map<string, string>) {
  return (text: string) =>
    [...text]
      .map((ch) => {
        if (ch === "\n" || ch === " ") return ch;
        const hit = cache.get(ch);
        if (hit !== undefined) return hit;
        let out = "?";
        for (const tryCh of [ch, ch.normalize("NFD").replace(/[̀-ͯ]/g, "")]) {
          try {
            if (tryCh) {
              font.widthOfTextAtSize(tryCh, 10);
              font.encodeText(tryCh);
              out = tryCh;
              break;
            }
          } catch {
            // Not in WinAnsi: try the next form.
          }
        }
        cache.set(ch, out);
        return out;
      })
      .join("");
}

type Writer = {
  line: (
    text: string,
    o?: {
      size?: number;
      bold?: boolean;
      indent?: number;
      color?: ReturnType<typeof rgb>;
      gap?: number;
    },
  ) => void;
  space: (h: number) => void;
  page: () => PDFPage;
  newPage: () => void;
  /** Room for something `h` tall: a new page if needed; returns where its bottom goes. */
  reserve: (h: number) => number;
};

function writer(doc: PDFDocument, regular: PDFFont, bold: PDFFont, footer: string): Writer {
  const cacheR = new Map<string, string>();
  const cacheB = new Map<string, string>();
  const safeR = drawable(regular, cacheR);
  const safeB = drawable(bold, cacheB);
  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const stamp = (p: PDFPage) =>
    p.drawText(safeR(footer), { x: MARGIN, y: 28, size: 7.5, font: regular, color: MUTED });
  stamp(page);
  const newPage = () => {
    page = doc.addPage(A4);
    stamp(page);
    y = A4[1] - MARGIN;
  };
  const line: Writer["line"] = (text, o = {}) => {
    const size = o.size ?? 9.5;
    const font = o.bold ? bold : regular;
    const safe = (o.bold ? safeB : safeR)(text);
    const indent = o.indent ?? 0;
    const width = A4[0] - MARGIN * 2 - indent;
    const words = safe.split(/\s+/).filter(Boolean);
    let current = "";
    const flush = () => {
      if (y < MARGIN + size) newPage();
      page.drawText(current, { x: MARGIN + indent, y, size, font, color: o.color ?? INK });
      y -= size * 1.35;
      current = "";
    };
    for (const w of words) {
      const next = current ? `${current} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && current) {
        flush();
        current = w;
      } else current = next;
    }
    if (current) flush();
    y -= o.gap ?? 3;
  };
  const reserve = (h: number) => {
    if (y - h < MARGIN) newPage();
    y -= h;
    return y;
  };
  return { line, space: (h) => (y -= h), page: () => page, newPage, reserve };
}

function writeBlocks(w: Writer, blocks: Block[], indent = 0) {
  for (const b of blocks) {
    if (b.type === "heading") {
      w.space(b.level <= 2 ? 6 : 2);
      w.line(b.text.replace(/\*\*/g, ""), {
        size: b.level === 1 ? 16 : b.level === 2 ? 12 : 10.5,
        bold: true,
        indent,
        gap: 4,
      });
    } else if (b.type === "para") w.line(plain(b.inlines), { indent });
    else if (b.type === "list")
      for (const item of b.items)
        w.line(`${b.checkboxes ? "[x]" : "•"} ${plain(item)}`, { indent: indent + 10 });
    else if (b.type === "quote") writeBlocks(w, b.blocks, indent + 12);
    else if (b.type === "table") {
      for (const row of b.rows)
        w.line(row.map((c, i) => `${plain(b.header[i] ?? [])}: ${plain(c)}`).join("  |  "), {
          indent,
          size: 8.5,
        });
    } else w.space(6);
  }
}

export type SignedRecord = {
  acceptanceId: string;
  version: string;
  bodySha256: string;
  renderedSha256: string;
  typedName: string;
  capacity: "individual" | "company";
  companyName: string | null;
  companyNumber: string | null;
  position: string | null;
  ticks: string[];
  signedAt: string;
  ip: string | null;
  userAgent: string | null;
  signaturePng: Uint8Array;
  /** Who accepts for OMS (operatorName from the legal details). */
  operatorName: string;
};

/** The signed agreement and its signing certificate, as PDF bytes. */
export async function signedAgreementPdf(
  renderedText: string,
  r: SignedRecord,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Latchkey Commission Partner Agreement v${r.version} (signed)`);
  doc.setSubject(`Acceptance ${r.acceptanceId}`);
  doc.setCreator("Latchkey");
  doc.setCreationDate(new Date(r.signedAt));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = writer(
    doc,
    regular,
    bold,
    `Commission Partner Agreement v${r.version} · signed by ${r.typedName} · ${ukDateTime(r.signedAt)} · acceptance ${r.acceptanceId}`,
  );

  const { before, after } = splitSigning(parseMarkdown(renderedText));
  writeBlocks(w, before);
  writeBlocks(w, after);

  w.newPage();
  w.line("Signing certificate", { size: 16, bold: true, gap: 8 });
  const row = (k: string, v: string) => {
    w.line(k, { bold: true, size: 9, gap: 0 });
    w.line(v, { indent: 0, gap: 6 });
  };
  row("Agreement", `Latchkey Commission Partner Agreement, version ${r.version}`);
  row("Fingerprint of the published text (SHA-256)", r.bodySha256);
  row("Fingerprint of the text shown and signed (SHA-256)", r.renderedSha256);
  row("Signed by (typed full legal name)", r.typedName);
  if (r.capacity === "company")
    row(
      "Signing for",
      `${r.companyName ?? ""}${r.companyNumber ? `, company number ${r.companyNumber}` : ""}${r.position ? `, as ${r.position}` : ""}`,
    );
  row("Signed at", `${new Date(r.signedAt).toISOString()} (UTC); ${ukDateTime(r.signedAt)}`);
  row("IP address", r.ip ?? "not available");
  row("Device and browser (user agent)", r.userAgent ?? "not available");
  w.line("Boxes ticked", { bold: true, size: 9, gap: 0 });
  for (const t of r.ticks) w.line(`[x] ${t}`, { indent: 10, gap: 2 });
  w.space(8);
  w.line("Drawn signature", { bold: true, size: 9, gap: 4 });
  try {
    const img = await doc.embedPng(r.signaturePng);
    const scale = Math.min(220 / img.width, 90 / img.height, 1);
    const h = img.height * scale;
    const bottom = w.reserve(h);
    w.page().drawImage(img, { x: MARGIN, y: bottom, width: img.width * scale, height: h });
  } catch {
    w.line("(signature image could not be drawn; it is kept with the signing record)", {
      color: MUTED,
    });
  }
  w.space(16);
  w.line(`Acceptance id: ${r.acceptanceId}`, { size: 8.5, color: MUTED });
  w.line(
    `For OMS: accepted electronically by ${r.operatorName} on activation of the Account (clause 4.2).`,
    { size: 8.5, color: MUTED },
  );
  return doc.save();
}

/** The agreement as shown now, unsigned (the reader page's "Download PDF"). */
export async function agreementPdf(
  renderedText: string,
  version: string,
  fingerprint: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Latchkey Commission Partner Agreement v${version}`);
  doc.setCreator("Latchkey");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = writer(
    doc,
    regular,
    bold,
    `Commission Partner Agreement v${version} · text fingerprint ${fingerprint} · not signed`,
  );
  writeBlocks(w, parseMarkdown(renderedText));
  return doc.save();
}
