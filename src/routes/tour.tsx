import { createFileRoute } from "@tanstack/react-router";

import { DemoLauncher } from "@/components/DemoPicker";
import { rebrand } from "@/lib/brand";

/** /tour: the stable link to the guest journey demo (shared in posts; keeps utm_*). */
export const Route = createFileRoute("/tour")({
  head: () => ({
    meta: [
      { title: rebrand("The guest journey — Latchkey") },
      { name: "description", content: rebrand("Walk through a guest's self check-in and branded stay guide, the way your guests would see it. A Latchkey demo; no sign-up needed.") },
      { property: "og:title", content: rebrand("The guest journey — Latchkey") },
      { property: "og:description", content: rebrand("Self check-in and a branded stay guide, as your guests see them. No sign-up needed.") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index" },
    ],
  }),
  component: () => <DemoLauncher as="guest" />,
});
