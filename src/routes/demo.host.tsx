import { createFileRoute } from "@tanstack/react-router";

import { DemoLauncher } from "@/components/DemoPicker";
import { rebrand } from "@/lib/brand";

/** /demo/host: the stable link to the host dashboard demo (signs in to the shared demo; keeps utm_*). */
export const Route = createFileRoute("/demo/host")({
  head: () => ({
    meta: [
      { title: rebrand("The host dashboard — Latchkey demo") },
      {
        name: "description",
        content: rebrand(
          "Look around a guest operations dashboard: arrivals, housekeeping, requests and reports. A Latchkey demo that resets every day.",
        ),
      },
      { property: "og:title", content: rebrand("The host dashboard — Latchkey demo") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index" },
    ],
  }),
  component: () => <DemoLauncher as="host" />,
});
