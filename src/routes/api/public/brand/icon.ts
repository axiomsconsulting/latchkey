import { createFileRoute } from "@tanstack/react-router";

import { brandIconSvg, initialIconSvg } from "@/components/brand/BrandLogo";
import { currentBrand } from "@/lib/brand";

/** The browser tab's icon: the site logo the super admin chose (an uploaded one is sent on to its own link). */
export const Route = createFileRoute("/api/public/brand/icon")({
  server: {
    handlers: {
      GET: async () => {
        const b = currentBrand();
        if (b.logoUrl) return new Response(null, { status: 302, headers: { Location: b.logoUrl, "Cache-Control": "public, max-age=300" } });
        const svg = b.logoMark === "initial" ? initialIconSvg(b.name) : brandIconSvg(b.logoMark);
        return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" } });
      },
    },
  },
});
