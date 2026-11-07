import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Services now sit under the housekeeping timeline on Bookings (?view=housekeeping); older links
 * and bookmarks land there, keeping ?tab=, ?job= and ?request=.
 */
export const Route = createFileRoute("/_authenticated/app/services")({
  beforeLoad: ({ search }) => {
    const s = search as Record<string, unknown>;
    throw redirect({
      to: "/app/bookings",
      search: {
        view: "housekeeping",
        ...(typeof s["tab"] === "string" ? { tab: s["tab"] as "inbox" } : {}),
        ...(typeof s["job"] === "string" ? { job: s["job"] } : {}),
        ...(typeof s["request"] === "string" ? { request: s["request"] } : {}),
      },
      replace: true,
    });
  },
});
