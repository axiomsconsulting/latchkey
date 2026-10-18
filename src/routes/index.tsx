import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Code2, Layers, Minus, NotebookPen, ScanLine, Sparkles } from "lucide-react";

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
import { footerText } from "@/lib/brand";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/")({
  // ?home=1 shows this page even to a signed-in host (the logo and "Home" link use it).
  validateSearch: (search: Record<string, unknown>): { home?: boolean } =>
    search["home"] === true || search["home"] === "1" || search["home"] === 1 ? { home: true } : {},
  head: () => ({
    meta: [
      { title: rebrand("Latchkey — self-service arrivals for small hosts") },
      { name: "description", content: marketing.subhead },
      { property: "og:title", content: rebrand("Latchkey — self-service arrivals for small hosts") },
      { property: "og:description", content: marketing.subhead },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // A host signed in on this device goes to the dashboard before this page paints.
    scripts: [{ children: HOME_REDIRECT_SCRIPT }],
  }),
  component: Landing,
});

const benefitIcons = [ScanLine, NotebookPen, Layers];

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
        {/* Above the fold: what it does, for whom, and the two ways in. Nothing else. */}
        <section className="pb-14 pt-8 sm:pb-20 sm:pt-14">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{brand.tagline}</p>
          <h1 className="mt-4 max-w-4xl text-balance text-4xl leading-[1.05] sm:text-6xl lg:text-7xl">{marketing.headline}</h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">{marketing.subhead}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <DemoPicker>
              <Button size="lg" variant="accent" className="pointer-coarse:h-14 pointer-coarse:px-7 pointer-coarse:text-base">
                {marketing.primaryCta}
                <ArrowRight />
              </Button>
            </DemoPicker>
            <Button asChild size="lg" variant="outline" className="pointer-coarse:h-14 pointer-coarse:px-7 pointer-coarse:text-base">
              <Link to="/start">{marketing.secondaryCta}</Link>
            </Button>
          </div>
          <OfferRibbon />
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{marketing.trust}</span>
            <ChannelBadge channel="airbnb" />
            <ChannelBadge channel="booking_com" />
            <ChannelBadge channel="homestay" />
            <ChannelBadge channel="direct" />
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

        <section className="mt-16 grid gap-5 md:grid-cols-2">
          <article className="rounded-3xl border border-border bg-muted p-6 sm:p-8">
            <h2 className="text-xl">{marketing.beforeAfter.beforeTitle(day)}</h2>
            <ul className="mt-5 space-y-3">
              {marketing.beforeAfter.before.map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed text-muted-foreground">
                  <Minus className="mt-1 size-4 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-lifted sm:p-8">
            <h2 className="text-xl">{marketing.beforeAfter.afterTitle(day)}</h2>
            <ul className="mt-5 space-y-3">
              {marketing.beforeAfter.after.map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed opacity-95">
                  <Check className="mt-1 size-4 shrink-0 text-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <div className="mt-16">
          <PricingSection />
        </div>

        {/* The facts, for anyone comparing: where the booking sites stop. */}
        <section className="mt-16" aria-labelledby="gap-title">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{marketing.gap.eyebrow}</p>
          <h2 id="gap-title" className="mt-3 max-w-3xl text-balance text-2xl leading-tight sm:text-3xl">{marketing.gap.title}</h2>
          <div className="card-soft mt-6 overflow-hidden p-0">
            <div className="hidden grid-cols-[10rem_1fr_1fr] gap-4 border-b border-border px-6 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span />
              <span>{marketing.gap.theyLabel}</span>
              <span className="text-primary">{marketing.gap.usLabel}</span>
            </div>
            <dl className="divide-y divide-border">
              {marketing.gap.rows.map((r) => (
                <div key={r.topic} className="grid gap-1 px-6 py-4 sm:grid-cols-[10rem_1fr_1fr] sm:gap-4">
                  <dt className="font-display">{r.topic}</dt>
                  <dd className="text-sm text-muted-foreground">
                    <span className="sm:hidden">{marketing.gap.theyLabel}: </span>
                    {r.they}
                  </dd>
                  <dd className="flex items-start gap-2 text-sm font-medium">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {r.us}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mt-10 flex flex-col gap-4 rounded-3xl border border-border bg-muted p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8" aria-labelledby="dev-title">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-accent">
              <Code2 className="size-4" /> {marketing.developers.eyebrow}
            </p>
            <h2 id="dev-title" className="mt-2 text-xl sm:text-2xl">{marketing.developers.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{marketing.developers.body}</p>
          </div>
          <Button asChild variant="outline" size="lg" className="shrink-0">
            <Link to="/developers">
              {marketing.developers.cta} <ArrowRight />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-8">
        <p className="mx-auto max-w-6xl text-sm text-muted-foreground">
          {footerText(marketing.footer)}
        </p>
      </footer>
    </div>
  );
}
