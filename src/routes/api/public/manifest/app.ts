import { createFileRoute } from "@tanstack/react-router";

import { rebrand } from "@/lib/brand";

const BASE = {
  "id": "/",
  "name": "Latchkey",
  "short_name": "Latchkey",
  "description": "Self check-in, guest guides and bookings for small hosts.",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "display_override": [
    "standalone",
    "minimal-ui"
  ],
  "orientation": "any",
  "background_color": "#FBF9F5",
  "theme_color": "#194129",
  "lang": "en-GB",
  "categories": [
    "business",
    "productivity",
    "travel"
  ],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "Today",
      "url": "/app/today?source=pwa",
      "icons": [
        {
          "src": "/icons/icon-192.png",
          "sizes": "192x192"
        }
      ]
    },
    {
      "name": "Bookings",
      "url": "/app/bookings?source=pwa",
      "icons": [
        {
          "src": "/icons/icon-192.png",
          "sizes": "192x192"
        }
      ]
    }
  ]
};

/** The host app's install manifest, carrying the brand's name (white label, or a host's own domain). */
export const Route = createFileRoute("/api/public/manifest/app")({
  server: {
    handlers: {
      GET: async () => {
        // The same as public/manifest.webmanifest, with the brand's name in it.
        const manifest = JSON.parse(rebrand(JSON.stringify(BASE))) as typeof BASE;
        return new Response(JSON.stringify(manifest), {
          headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" },
        });
      },
    },
  },
});
