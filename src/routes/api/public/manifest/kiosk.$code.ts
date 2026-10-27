import { createFileRoute } from "@tanstack/react-router";

/**
 * The kiosk as its own installable app: opens straight onto this
 * property's front-door check-in, full screen and landscape.
 */
export const Route = createFileRoute("/api/public/manifest/kiosk/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const code = params.code
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .slice(0, 40);
        let name = "Check-in";
        try {
          const { admin } = await import("@/lib/checkin.server");
          const db = await admin();
          const { data } = await db
            .from("properties")
            .select("name")
            .eq("short_code", code)
            .maybeSingle();
          if (data?.name) name = `${data.name} check-in`;
        } catch {
          // The kiosk still installs with a plain name.
        }
        const manifest = {
          id: `/kiosk/${code}`,
          name,
          short_name: "Check-in",
          start_url: `/kiosk/${code}?source=pwa`,
          scope: `/kiosk/${code}`,
          display: "fullscreen",
          display_override: ["fullscreen", "standalone"],
          // Either way up: door tablets are mounted on their side or upright.
          orientation: "any",
          background_color: "#FBF9F5",
          theme_color: "#194129",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            {
              src: "/icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        };
        return new Response(JSON.stringify(manifest), {
          headers: {
            "Content-Type": "application/manifest+json",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
