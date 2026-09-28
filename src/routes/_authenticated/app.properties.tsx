import { createFileRoute } from "@tanstack/react-router";
import { Home } from "lucide-react";

import { PlaceholderPage } from "@/components/host/PlaceholderPage";
import { hostPlaceholders } from "@/content/copy";

export const Route = createFileRoute("/app/properties")({
  head: () => ({
    meta: [
      { title: "Properties — Latchkey" },
      {
        name: "description",
        content: "Rooms, access instructions, house rules and the extras you offer guests.",
      },
      { property: "og:title", content: "Properties — Latchkey" },
      {
        property: "og:description",
        content: "Rooms, access instructions, house rules and the extras you offer guests.",
      },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title={hostPlaceholders.properties.title}
      body={hostPlaceholders.properties.body}
      icon={Home}
    />
  ),
});
