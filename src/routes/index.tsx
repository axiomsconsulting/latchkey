import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bot, Braces, Check, Code2, KeyRound, Minus, ScanLine, Sparkles, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChannelBadge } from "@/components/ChannelBadge";
import { brand, marketing } from "@/content/copy";
import { OfferRibbon, PricingSection } from "@/components/PricingSection";
import { DemoPicker } from "@/components/DemoPicker";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspace } from "@/lib/host.functions";
import { canWrite } from "@/lib/roles";
import { HOME_REDIRECT_SCRIPT, rememberDashboard } from "@/lib/home-redirect";

export const Route = createFileRoute("/")({
  // ?home=1 shows this page even to a signed-in host (the logo and "Home" link use it).
  validateSearch: (search: Record<string, unknown>): { home?: boolean } =>
    search["home"] === true || search["home"] === "1" || search["home"] === 1 ? { home: true } : {},
  head: () => ({
    meta: [
      { title: "Latchkey — self-service arrivals for small hosts" },
      { name: "description", content: marketing.subhead },
      { property: "og:title", content: "Latchkey — self-service arrivals for small hosts" },
      { property: "og:description", content: marketing.subhead },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // A host signed in on this device goes to the dashboard before this page paints.
    scripts: [{ children: HOME_REDIRECT_SCRIPT }],
  }),
  component: Landing,
});

const benefitIcons = [ScanLine, Layers, Sparkles];

/** "Tuesday", in the visitor's own time zone when given one. */
function weekday(timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", ...(timeZone ? { timeZone } : {}) }).format(new Date());
}

function Landing() {
  // The server renders UK time; the browser then switches to the visitor's day.
  const [day, setDay] = useState(() => weekday("Europe/London"));
  useEffect(() => setDay(weekday()), []);
  const { home } = Route.useSearch();
  const navigate = useNavigate();

  // Hosts and managers who are signed in go straight to their dashboard.
  useEffect(() => {
    if (home) return;
    let live = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session || !live) return;
      try {
        const ws = await getWorkspace();
        rememberDashboard(canWrite(ws.role));
        if (live && canWrite(ws.role)) await navigate({ to: "/app/today", replace: true });
      } catch {
        // Not a host after all, or offline: stay on the home page.
      }
    });
    return () => {
      live = false;
    };
  }, [home, navigate]);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="py-10 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
            {brand.tagline}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.08] sm:text-6xl">
            {marketing.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {marketing.subhead}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <DemoPicker>
              <Button size="lg" variant="accent">
                {marketing.primaryCta}
                <ArrowRight />
              </Button>
            </DemoPicker>
            <Button asChild size="lg" variant="outline">
              <Link to="/start">{marketing.secondaryCta}</Link>
            </Button>
          </div>
          <OfferRibbon />
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Works alongside</span>
            <ChannelBadge channel="airbnb" />
            <ChannelBadge channel="booking_com" />
            <ChannelBadge channel="homestay" />
            <ChannelBadge channel="direct" />
          </div>
        </section>

        {/* Where the booking sites stop, Latchkey takes over. */}
        <section className="mb-16" aria-labelledby="gap-title">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{marketing.gap.eyebrow}</p>
          <h2 id="gap-title" className="mt-3 max-w-3xl text-3xl leading-tight sm:text-4xl">{marketing.gap.title}</h2>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">{marketing.gap.body}</p>
          <div className="mt-8 grid gap-4">
            {marketing.gap.rows.map((r) => (
              <article key={r.topic} className="card-soft grid gap-4 p-5 sm:p-6 lg:grid-cols-[12rem_1fr_1fr_1.4fr] lg:items-start">
                <h3 className="font-display text-lg">{r.topic}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">{marketing.gap.theyLabel}</span>
                  {r.they}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">{marketing.gap.youLabel}</span>
                  {r.you}
                </p>
                <p className="rounded-2xl bg-primary/5 p-3 text-sm leading-relaxed">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                    <Check className="size-3.5" /> {marketing.gap.usLabel}
                  </span>
                  {r.us}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-3">
          {marketing.benefits.map((benefit, i) => {
            const Icon = benefitIcons[i] ?? Sparkles;
            return (
              <article key={benefit.title} className="card-soft p-6">
                <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
                  <Icon className="size-6" />
                </span>
                <h2 className="mt-5 text-xl">{benefit.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{benefit.body}</p>
              </article>
            );
          })}
        </section>

        {/* For developers: the API and the MCP server. */}
        <section className="mt-16 rounded-3xl border border-border bg-muted p-6 sm:p-10" aria-labelledby="dev-title">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-accent">
            <Code2 className="size-4" /> {marketing.developers.eyebrow}
          </p>
          <h2 id="dev-title" className="mt-3 text-2xl sm:text-3xl">{marketing.developers.title}</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">{marketing.developers.body}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {marketing.developers.points.map((d, i) => {
              const Icon = [Braces, Bot, KeyRound][i] ?? Braces;
              return (
                <article key={d.title} className="rounded-2xl bg-card p-5 shadow-soft">
                  <Icon className="size-6 text-primary" />
                  <h3 className="mt-3 font-display text-lg">{d.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{d.body}</p>
                </article>
              );
            })}
          </div>
          <Button asChild variant="outline" size="lg" className="mt-6">
            <Link to="/developers">
              {marketing.developers.cta} <ArrowRight />
            </Link>
          </Button>
        </section>

        <div className="mt-16">
          <PricingSection />
        </div>

        <section className="mt-16 grid gap-5 md:grid-cols-2">
          <article className="rounded-3xl border border-border bg-muted p-6 sm:p-8">
            <h2 className="text-xl">{marketing.beforeAfter.beforeTitle(day)}</h2>
            <ul className="mt-5 space-y-3">
              {marketing.beforeAfter.before.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <Minus className="mt-0.5 size-4 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-lifted sm:p-8">
            <h2 className="text-xl">{marketing.beforeAfter.afterTitle(day)}</h2>
            <ul className="mt-5 space-y-3">
              {marketing.beforeAfter.after.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed opacity-95">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-8">
        <p className="mx-auto max-w-6xl text-sm text-muted-foreground">
          {marketing.footer}
        </p>
      </footer>
    </div>
  );
}
