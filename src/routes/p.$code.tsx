import { createFileRoute, notFound } from "@tanstack/react-router";

import { CheckInFlow } from "@/components/guest/CheckInFlow";
import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { guest as copy } from "@/content/copy";
import { getCheckinProperty } from "@/lib/checkin.functions";

export const Route = createFileRoute("/p/$code")({
  validateSearch: (search: Record<string, unknown>): { resume?: string } =>
    typeof search["resume"] === "string" ? { resume: search["resume"] } : {},

  loader: async ({ params }) => {
    const p = await getCheckinProperty({ data: { code: params.code } });
    if (!p.found) throw notFound({ data: { paused: "paused" in p && p.paused === true } });
    return p;
  },

  head: ({ loaderData }) => {
    const name = loaderData?.name ?? "Latchkey";
    return {
      meta: [
        { title: `Checking in — ${name}` },
        { name: "description", content: `Check yourself in at ${name}. No app, no sign-up, about a minute.` },
        { property: "og:title", content: `Checking in — ${name}` },
        { property: "og:description", content: `Check yourself in at ${name}.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  notFoundComponent: ({ data }) => (
    <GuestFrame>
      <GuestMessage text={(data as { paused?: boolean } | undefined)?.paused ? copy.checkinPaused : copy.notFound} />
    </GuestFrame>
  ),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.error} />
    </GuestFrame>
  ),
  component: GuestCheckIn,
});

function GuestCheckIn() {
  const p = Route.useLoaderData();
  const { resume } = Route.useSearch();
  return (
    <GuestFrame theme={p.theme} name={p.name} switchable>
      <CheckInFlow property={p} hostPhone={p.hostPhone} resumeToken={resume ?? null} />
    </GuestFrame>
  );
}

