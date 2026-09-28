import { createFileRoute } from "@tanstack/react-router";
import { Sun } from "lucide-react";

import { PlaceholderPage } from "@/components/host/PlaceholderPage";
import { ChannelBadge } from "@/components/ChannelBadge";
import { hostPlaceholders } from "@/content/copy";

export const Route = createFileRoute("/app/today")({
  head: () => ({
    meta: [
      { title: "Today — Latchkey host dashboard" },
      {
        name: "description",
        content: "Arrivals, departures and guest requests for the day at The Trinity Rooms.",
      },
      { property: "og:title", content: "Today — Latchkey host dashboard" },
      {
        property: "og:description",
        content: "Arrivals, departures and guest requests for the day at The Trinity Rooms.",
      },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  return (
    <PlaceholderPage title={hostPlaceholders.today.title} body={hostPlaceholders.today.body} icon={Sun}>
      <div className="flex flex-wrap gap-2">
        <ChannelBadge channel="airbnb" />
        <ChannelBadge channel="booking" />
        <ChannelBadge channel="homestay" />
        <ChannelBadge channel="direct" />
      </div>
    </PlaceholderPage>
  );
}
