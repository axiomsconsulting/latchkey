import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Housekeeping is now a view on Bookings (?view=housekeeping); older links and bookmarks land there,
 * keeping ?day=, ?room= and ?focus=schedule.
 */
export const Route = createFileRoute("/_authenticated/app/housekeeping")({
  beforeLoad: ({ search }) => {
    const s = search as Record<string, unknown>;
    throw redirect({
      to: "/app/bookings",
      search: {
        view: "housekeeping",
        ...(typeof s["day"] === "string" ? { day: s["day"] } : {}),
        ...(typeof s["room"] === "string" ? { room: s["room"] } : {}),
        ...(s["focus"] === "schedule" ? { focus: "schedule" as const } : {}),
      },
      replace: true,
    });
  },
});
