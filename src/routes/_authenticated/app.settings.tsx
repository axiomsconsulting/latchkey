import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { PlaceholderPage } from "@/components/host/PlaceholderPage";
import { hostPlaceholders } from "@/content/copy";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Latchkey" },
      {
        name: "description",
        content: "Your details, quiet hours, cleaning windows and approval preferences.",
      },
      { property: "og:title", content: "Settings — Latchkey" },
      {
        property: "og:description",
        content: "Your details, quiet hours, cleaning windows and approval preferences.",
      },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title={hostPlaceholders.settings.title}
      body={hostPlaceholders.settings.body}
      icon={Settings}
    />
  ),
});
