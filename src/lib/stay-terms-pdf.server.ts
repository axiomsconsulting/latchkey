/**
 * Server only: a guest's accepted booking terms, or signed licence, as a
 * PDF: the exact text they saw, then a record of the acceptance (who, when,
 * from where, what they ticked and declared, the text's fingerprint and the
 * drawn signature). Same pdf-lib writer as the Commission Partner agreement.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

import { parseMarkdown, ukDateTime } from "./partner-agreement";
import { MARGIN, MUTED, writeBlocks, writer } from "./partner-pdf.server";
import { TICK_TEXT, type Tick } from "./stay-terms";

export type StayRecord = {
  id: string;
  kind: "terms" | "licence";
  version: string;
  property: string;
  reference: string | null;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  renderedSha256: string;
  ticks: string[];
  homeAddress: string | null;
  purpose: string | null;
  typedName: string | null;
  signedAt: string;
  ip: string | null;
  userAgent: string | null;
  signaturePng: Uint8Array | null;
};

export async function stayAgreementPdf(text: string, r: StayRecord): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const title = r.kind === "licence" ? "Licence to occupy (signed)" : "Booking terms (accepted)";
  doc.setTitle(`${r.property}: ${title}`);
  doc.setSubject(`Record ${r.id}`);
  doc.setCreator("Latchkey");
  doc.setCreationDate(new Date(r.signedAt));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = writer(
    doc,
    regular,
    bold,
    `${r.property} · ${title} · ${r.guestName} · ${ukDateTime(r.signedAt)} · record ${r.id}`,
  );
  writeBlocks(w, parseMarkdown(text));

  w.newPage();
  w.line(r.kind === "licence" ? "Signing record" : "Acceptance record", {
    size: 16,
    bold: true,
    gap: 8,
  });
  const row = (k: string, v: string) => {
    w.line(k, { bold: true, size: 9, gap: 0 });
    w.line(v, { gap: 6 });
  };
  row("Document", `${title}, version ${r.version}`);
  if (r.reference) row("Booking reference", r.reference);
  row("Guest", r.guestName);
  if (r.guestEmail) row("Email", r.guestEmail);
  if (r.guestPhone) row("Phone", r.guestPhone);
  if (r.homeAddress) row("Declared permanent home", r.homeAddress);
  if (r.purpose) row("Declared purpose of the stay", r.purpose);
  row("Fingerprint of the text shown (SHA-256)", r.renderedSha256);
  row(
    r.kind === "licence" ? "Signed at" : "Accepted at",
    `${new Date(r.signedAt).toISOString()} (UTC); ${ukDateTime(r.signedAt)}`,
  );
  row("IP address", r.ip ?? "not available");
  row("Device and browser (user agent)", r.userAgent ?? "not available");
  w.line("Boxes ticked", { bold: true, size: 9, gap: 0 });
  for (const t of r.ticks) w.line(`[x] ${TICK_TEXT[t as Tick] ?? t}`, { indent: 10, gap: 2 });
  if (r.typedName) {
    w.space(6);
    row("Typed full name", r.typedName);
  }
  if (r.signaturePng) {
    w.space(4);
    w.line("Drawn signature", { bold: true, size: 9, gap: 4 });
    try {
      const img = await doc.embedPng(r.signaturePng);
      const scale = Math.min(220 / img.width, 90 / img.height, 1);
      const h = img.height * scale;
      const bottom = w.reserve(h);
      w.page().drawImage(img, { x: MARGIN, y: bottom, width: img.width * scale, height: h });
    } catch {
      w.line("(the signature image is kept with the record)", { color: MUTED });
    }
  }
  w.space(14);
  w.line(`Record id: ${r.id}. Kept by Latchkey for the provider.`, { size: 8.5, color: MUTED });
  return doc.save();
}
