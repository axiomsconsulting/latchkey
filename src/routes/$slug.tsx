import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BrandBlock, ThemeFeatures } from "@/components/theme/ThemeDecor";
import { welcomeTitle } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ArrowRight, KeyRound, Tablet } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { guest as copy } from "@/content/copy";
import { getCheckinProperty } from "@/lib/checkin.functions";
import { RESERVED_SLUGS } from "@/lib/theme";
import { rebrand } from "@/lib/brand";

/** Branded home for one property, e.g. /hill. Guests and the host can bookmark it. */
export const Route = createFileRoute("/$slug")({
  loader: async ({ params }) => {
    const slug = params.slug.toLowerCase();
    if (RESERVED_SLUGS.has(slug) || !/^[a-z0-9-]{2,40}$/.test(slug)) throw notFound();
    const p = await getCheckinProperty({ data: { code: slug } });
    if (!p.found) throw notFound();
    return p;
  },
  head: ({ loaderData }) => {
    const name = loaderData?.name ?? rebrand("Latchkey");
    return {
      meta: [
        { title: `${name} — welcome` },
        {
          name: "description",
          content: `Check in, find your room and ask for anything during your stay at ${name}.`,
        },
        { property: "og:title", content: `${name} — welcome` },
        {
          property: "og:description",
          content: `Check yourself in and find your guest guide at ${name}.`,
        },
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
      <main
        className={cn(
          "mx-auto flex max-w-4xl flex-col gap-8 py-12 sm:py-20",
          p.theme.layout === "centred" && "items-center text-center",
        )}
      >
        {p.theme.layout === "centred" && !p.theme.headerBand ? (
          <BrandBlock theme={p.theme} name={p.name} />
        ) : null}
        <div className="space-y-4">
          {p.theme.eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">
              {p.theme.eyebrow}
            </p>
          ) : null}
          <h1 className="text-4xl sm:text-6xl">
            {welcomeTitle(p.theme, p.name, `Welcome to ${p.name}`)}
          </h1>
          <p
            className={cn(
              "max-w-xl text-lg text-muted-foreground",
              p.theme.layout === "centred" && "mx-auto",
            )}
          >
            {p.theme.welcomeBody ||
              "Check yourself in, find your room and ask for anything you need. No app, no sign-up."}
          </p>
          {p.theme.features.length ? (
            <ThemeFeatures
              theme={p.theme}
              className={cn("pt-2", p.theme.layout === "centred" && "justify-center text-left")}
            />
          ) : null}
        </div>
        {p.theme.coverImageUrl ? (
          <img
            src={p.theme.coverImageUrl}
            alt=""
            className="aspect-[16/7] w-full rounded-2xl object-cover shadow-soft"
          />
        ) : null}
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <Button asChild size="touch-xl" className="justify-between">
            <Link to="/kiosk/$code" params={{ code: p.code }} search={{ guest: true }}>
              <span className="flex items-center gap-2">
                <KeyRound className="size-6" /> {copy.startCta}
              </span>
              <ArrowRight className="size-6" />
            </Link>
          </Button>
          <Button asChild size="touch-xl" variant="outline" className="justify-between">
            <Link to="/kiosk/$code" params={{ code: p.code }}>
              <span className="flex items-center gap-2">
                <Tablet className="size-6" /> Front-door tablet mode
              </span>
              <ArrowRight className="size-6" />
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Already checked in? Open the private guest guide link you were given when you checked in.
        </p>
      </main>
      <footer className="mx-auto flex max-w-4xl justify-end pb-8">
        <Link
          to="/auth"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Host portal
        </Link>
      </footer>
    </GuestFrame>
  );
}
