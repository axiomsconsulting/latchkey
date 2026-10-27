import { createFileRoute, notFound } from "@tanstack/react-router";

import { DemoLauncher } from "@/components/DemoPicker";
import { rebrand } from "@/lib/brand";
import { showcaseByKey, type ShowcaseKey } from "@/lib/demo-showcase";

/** /demo/host/texas … : the host dashboard on that regional demo property, with its own campaign. */
export const Route = createFileRoute("/demo/host_/$region")({
  loader: ({ params }) => {
    const spec = showcaseByKey(params.region);
    if (!spec) throw notFound();
    return {
      key: spec.key,
      label: spec.label,
      name: spec.property.name,
      campaign: spec.campaign.host,
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: rebrand(`The host dashboard: ${loaderData?.name ?? "demo"} — Latchkey demo`) },
      {
        name: "description",
        content: rebrand(
          `Look around the dashboard of a fictional property in ${loaderData?.label ?? "the demo"}: arrivals, housekeeping, breakfast orders and reports. Resets daily.`,
        ),
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "index" },
    ],
  }),
  component: RegionHost,
});

function RegionHost() {
  const d = Route.useLoaderData();
  return <DemoLauncher as="host" region={d.key as ShowcaseKey} campaign={d.campaign} />;
}
