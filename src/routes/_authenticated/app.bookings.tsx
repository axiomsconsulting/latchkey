import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";

import { PlaceholderPage } from "@/components/host/PlaceholderPage";
import { hostPlaceholders } from "@/content/copy";

export const Route = createFileRoute("/app/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Latchkey" },
      {
        name: "description",
        content: "Every booking across Airbnb, Booking.com, Homestay.com and direct in one list.",
      },
      { property: "og:title", content: "Bookings — Latchkey" },
      {
        property: "og:description",
        content: "Every booking across Airbnb, Booking.com, Homestay.com and direct in one list.",
      },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title={hostPlaceholders.bookings.title}
      body={hostPlaceholders.bookings.body}
      icon={CalendarDays}
    />
  ),
});
