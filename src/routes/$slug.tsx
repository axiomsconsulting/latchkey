import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, KeyRound, Tablet } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { guest as copy } from "@/content/copy";
import { getCheckinProperty } from "@/lib/checkin.functions";
import { RESERVED_SLUGS } from "@/lib/theme";

/** Branded home for one property, e.g. /trinity. Guests and the host can bookmark it. */
export const Route = createFileRoute("/$slug")({
  loader: async ({ params }) => {
    const slug = params.slug.toLowerCase();
    if (RESERVED_SLUGS.has(slug) || !/^[a-z0-9-]{2,40}$/.test(slug)) throw notFound();
    const p = await getCheckinProperty({ data: { code: slug } });
    if (!p.found) throw notFound();
    return p;
  },
  head: ({ loaderData }) => {
    const name = loaderData?.name ?? "Latchkey";
    return {
      meta: [
        { title: `${name} — welcome` },
        { name: "description", content: `Check in, find your room and ask for anything during your stay at ${name}.` },
        { property: "og:title", content: `${name} — welcome` },
        { property: "og:description", content: `Self check-in and stay guide for ${name}.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.notFound} />
    </GuestFrame>
  ),
  component: PropertyHome,
});

function PropertyHome() {
  const p = Route.useLoaderData();
  return (
    <GuestFrame theme={p.theme} name={p.name}>
      <main className="mx-auto flex max-w-4xl flex-col gap-8 py-12 sm:py-20">
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl">Welcome to {p.name}</h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Check yourself in, find your room and ask for anything you need. No app, no sign-up.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild size="touch-xl" className="justify-between">
            <Link to="/p/$code" params={{ code: p.code }}>
              <span className="flex items-center gap-2"><KeyRound className="size-6" /> {copy.startCta}</span>
              <ArrowRight className="size-6" />
            </Link>
          </Button>
          <Button asChild size="touch-xl" variant="outline" className="justify-between">
            <Link to="/kiosk/$code" params={{ code: p.code }}>
              <span className="flex items-center gap-2"><Tablet className="size-6" /> Front-door tablet mode</span>
              <ArrowRight className="size-6" />
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Already checked in? Use the private link from your check-in to see your stay page.
        </p>
      </main>
      <footer className="mx-auto flex max-w-4xl justify-end pb-8">
        <Link to="/auth" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Host portal
        </Link>
      </footer>
    </GuestFrame>
  );
}
