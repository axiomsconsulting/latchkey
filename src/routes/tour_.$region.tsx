import { createFileRoute, notFound } from "@tanstack/react-router";

import { DemoLauncher } from "@/components/DemoPicker";
import { rebrand } from "@/lib/brand";
import { showcaseByKey, type ShowcaseKey } from "@/lib/demo-showcase";

/** /tour/texas, /tour/mayfair, /tour/paris, /tour/tokyo: a regional guest journey, each with its own campaign. */
export const Route = createFileRoute("/tour_/$region")({
  loader: ({ params }) => {
    const spec = showcaseByKey(params.region);
    if (!spec) throw notFound();
    return { key: spec.key, label: spec.label, name: spec.property.name, campaign: spec.campaign.guest };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: rebrand(`The guest journey: ${loaderData?.name ?? "demo"}, ${loaderData?.label ?? ""} — Latchkey`) },
      { name: "description", content: rebrand(`Check in and read the stay guide at a fictional property in ${loaderData?.label ?? "the demo"}. A Latchkey demo that resets daily.`) },
      { property: "og:title", content: rebrand(`The guest journey in ${loaderData?.label ?? "the demo"} — Latchkey`) },
      { property: "og:type", content: "website" },
      { name: "robots", content: "index" },
    ],
  }),
  component: RegionTour,
});

function RegionTour() {
  const d = Route.useLoaderData();
  return <DemoLauncher as="guest" region={d.key as ShowcaseKey} campaign={d.campaign} />;
}
