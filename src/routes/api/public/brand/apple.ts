import { createFileRoute } from "@tanstack/react-router";

import { currentBrand } from "@/lib/brand";
import { appleIcon } from "@/lib/brand-icons";

/** The home-screen icon on iPhones and iPads, following the site logo. */
export const Route = createFileRoute("/api/public/brand/apple")({
  server: {
    handlers: {
      GET: async () => new Response(null, { status: 302, headers: { Location: appleIcon(currentBrand()), "Cache-Control": "public, max-age=300" } }),
    },
  },
});
