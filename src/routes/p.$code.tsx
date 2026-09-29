import { createFileRoute, notFound } from "@tanstack/react-router";

import { CheckInFlow } from "@/components/guest/CheckInFlow";
import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { guest as copy } from "@/content/copy";
import { getCheckinProperty } from "@/lib/checkin.functions";

export const Route = createFileRoute("/p/$code")({
  validateSearch: (search: Record<string, unknown>) => ({
    resume: typeof search["resume"] === "string" ? search["resume"] : undefined,
  }),
  loader: async ({ params }) => {
    const p = await getCheckinProperty({ data: { code: params.code } });
    if (!p.found) throw notFound();
    return p;
  },

  head: ({ loaderData }) => {
    const name = loaderData?.name ?? "Latchkey";
    return {
      meta: [
        { title: `Check in — ${name}` },
        { name: "description", content: `Self check-in for ${name}. No app, no sign-up, about a minute.` },
        { property: "og:title", content: `Check in — ${name}` },
        { property: "og:description", content: `Self check-in for ${name}.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  notFoundComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.notFound} />
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
  return (
    <GuestFrame theme={p.theme} name={p.name}>
      <CheckInFlow property={p} hostPhone={p.hostPhone} />
    </GuestFrame>
  );
}
