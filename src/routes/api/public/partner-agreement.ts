import { createFileRoute } from "@tanstack/react-router";

/** The Commission Partner agreement in force, as a PDF to read or keep (not signed). */
export const Route = createFileRoute("/api/public/partner-agreement")({
  server: {
    handlers: {
      GET: async () => {
        const { renderCurrent } = await import("@/lib/partner-agreement.functions");
        const r = await renderCurrent(null);
        if (!r) return new Response("The agreement isn't available yet.", { status: 404 });
        const { agreementPdf } = await import("@/lib/partner-pdf.server");
        const pdf = await agreementPdf(
          r.rendered,
          r.version.version,
          r.version.body_sha256.slice(0, 12),
        );
        return new Response(pdf as unknown as BodyInit, {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="latchkey-commission-partner-agreement-v${r.version.version}.pdf"`,
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
