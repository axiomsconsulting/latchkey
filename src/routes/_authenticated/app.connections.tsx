import { createFileRoute } from "@tanstack/react-router";
import { Plug } from "lucide-react";

import { PlaceholderPage } from "@/components/host/PlaceholderPage";
import { hostPlaceholders } from "@/content/copy";

export const Route = createFileRoute("/_authenticated/app/connections")({
  head: () => ({
    meta: [
      { title: "Connections — Latchkey" },
      {
        name: "description",
        content: "Link your booking channels and calendars so arrivals stay in step.",
      },
      { property: "og:title", content: "Connections — Latchkey" },
      {
        property: "og:description",
        content: "Link your booking channels and calendars so arrivals stay in step.",
      },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title={hostPlaceholders.connections.title}
      body={hostPlaceholders.connections.body}
      icon={Plug}
    />
  ),
});
