import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BedDouble, Building2, CalendarCheck, Check, Code2, DoorOpen, Hourglass, Inbox, LayoutDashboard, MessagesSquare, Minus, MoonStar, Palette, Sparkles, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChannelBadge } from "@/components/ChannelBadge";
import { brand, marketing } from "@/content/copy";
import { OfferRibbon, PricingSection } from "@/components/PricingSection";
import { sessionUtm, type Utm } from "@/lib/attribution";
import { LegalLinks } from "@/components/LegalPage";
import { HomeArt } from "@/components/HomeArt";
import { HOME_ART_SLOTS, type HomeArtSlot } from "@/lib/home-art";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspace } from "@/lib/host.functions";
import { canWrite } from "@/lib/roles";
import { HOME_REDIRECT_SCRIPT, rememberDashboard } from "@/lib/home-redirect";
import { footerText } from "@/lib/brand";
import { PageSections, Section } from "@/components/PageSections";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/")({
  // ?home=1 shows this page even to a signed-in host (the logo and "Home" link use it).
  validateSearch: (search: Record<string, unknown>): { home?: boolean } =>
    search["home"] === true || search["home"] === "1" || search["home"] === 1 ? { home: true } : {},
  head: () => ({
    meta: [
      { title: rebrand("Latchkey — guest operations for independent accommodation") },
      { name: "description", content: marketing.subhead },
      { property: "og:title", content: rebrand("Latchkey — guest operations for independent accommodation") },
      { property: "og:description", content: marketing.subhead },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // A host signed in on this device goes to the dashboard before this page paints.
    scripts: [{ children: HOME_REDIRECT_SCRIPT }],
  }),
  component: Landing,
});

const benefitIcons = [MoonStar, Inbox, Palette];
const journeyIcons = [CalendarCheck, DoorOpen, BedDouble, MessagesSquare, LayoutDashboard];
const pillarIcons = [DoorOpen, Palette, Wrench, Building2];

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
  // The session's utm_* on the demo and trial links, read after hydration.
  const [utm, setUtm] = useState<Utm>({});
  useEffect(() => setUtm(sessionUtm()), []);

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
    // isolate: the home page's background photos sit behind everything; overflow-x-clip: their full width never scrolls sideways.
    <div className="isolate min-h-screen overflow-x-clip bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-5 pb-24">
        {/* Above the fold: what it does, for whom, and the two ways in. Nothing else. */}
        <section className="relative pb-14 pt-8 sm:pb-20 sm:pt-14">
          {/* The super admin's photo, faint, behind the headline (Latchkey admin → Site settings → Home page pictures). */}
          <HomeArt slot="hero" />
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{brand.tagline}</p>
          <h1 className="mt-4 max-w-4xl text-balance text-4xl leading-[1.05] sm:text-6xl lg:text-7xl">{marketing.headline}</h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">{marketing.subhead}</p>
          {/* See it first: the guest journey, then the host's side; the trial for anyone ready. */}
          <div className="mt-9 flex flex-wrap gap-3">
            {/* Real links (shareable, crawlable); the session's utm_* go along. */}
            <Button asChild size="lg" variant="accent" className="pointer-coarse:h-14 pointer-coarse:px-7 pointer-coarse:text-base">
              <Link to="/tour" search={utm as never}>
                {marketing.primaryCta}
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="pointer-coarse:h-14 pointer-coarse:px-7 pointer-coarse:text-base">
              <Link to="/demo/host" search={utm as never}>{marketing.hostCta}</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="pointer-coarse:h-14 pointer-coarse:px-7 pointer-coarse:text-base">
              <Link to="/start" search={utm as never}>{marketing.secondaryCta}</Link>
            </Button>
          </div>
          <OfferRibbon />
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{marketing.trust}</span>
            <ChannelBadge channel="airbnb" />
            <ChannelBadge channel="booking_com" />
            <ChannelBadge channel="homestay" />
            <ChannelBadge channel="direct" />
            <span className="text-sm text-muted-foreground">{marketing.trustTail}</span>
          </div>
        </section>

        {/* Everything below the headline, in the order the super admin chose (Latchkey admin → Menu and pages). */}
        <div className="space-y-16">
          <PageSections page="home" decorate={(id) => (HOME_ART_SLOTS.includes(id as HomeArtSlot) ? <HomeArt slot={id as HomeArtSlot} /> : null)}>
        <Section id="benefits">
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
        </Section>

        <Section id="audience">
        <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8" aria-labelledby="audience-title">
          <h2 id="audience-title" className="text-2xl">{marketing.audience.title}</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">{marketing.audience.body}</p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {marketing.audience.kinds.map((k) => (
              <li key={k} className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground">{k}</li>
            ))}
          </ul>
        </section>
        </Section>

        <Section id="journey">
        <section aria-labelledby="journey-title">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{marketing.journey.eyebrow}</p>
          <h2 id="journey-title" className="mt-3 max-w-3xl text-balance text-2xl leading-tight sm:text-3xl">{marketing.journey.title}</h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {marketing.journey.steps.map((st, i) => {
              const Icon = journeyIcons[i] ?? Sparkles;
              return (
                <li key={st.title} className="card-soft relative flex gap-4 p-5 lg:flex-col lg:gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-accent">{i + 1}</span>
                    <span className="block font-display text-lg leading-tight">{st.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{st.body}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/tour" search={utm as never}>
                {marketing.primaryCta} <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
        </Section>

        <Section id="pillars">
        <section aria-labelledby="pillars-title">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{marketing.pillars.eyebrow}</p>
          <h2 id="pillars-title" className="mt-3 text-2xl leading-tight sm:text-3xl">{marketing.pillars.title}</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {marketing.pillars.items.map((p, i) => {
              const Icon = pillarIcons[i] ?? Sparkles;
              return (
                <article key={p.title} className="card-soft p-6">
                  <h3 className="flex items-center gap-3 text-xl">
                    <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-primary"><Icon className="size-5" /></span>
                    {p.title}
                  </h3>
                  <ul className="mt-4 space-y-2">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex gap-2 text-sm leading-relaxed">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {pt}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
        </Section>

        <Section id="beforeAfter">
        <section className="grid gap-5 md:grid-cols-2">
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
        </Section>

        <Section id="pricing">
          <PricingSection />
        </Section>

        {/* The facts, for anyone comparing: where the booking sites stop. */}
        <Section id="why">
        <section aria-labelledby="gap-title">
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
          {/* What Latchkey does, and what it does not replace. */}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-border bg-muted p-6">
              <h3 className="text-lg">{marketing.gap.keepTitle}</h3>
              <ul className="mt-3 space-y-2">
                {marketing.gap.keep.map((k) => (
                  <li key={k} className="flex gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0" /> {k}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl bg-primary p-6 text-primary-foreground">
              <h3 className="text-lg">{marketing.gap.oursTitle}</h3>
              <ul className="mt-3 space-y-2">
                {marketing.gap.ours.map((k) => (
                  <li key={k} className="flex gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-accent" /> {k}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{marketing.gap.note}</p>
        </section>
        </Section>

        <Section id="next">
        <section className="rounded-3xl border border-dashed border-border p-6 sm:p-8" aria-labelledby="next-title">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-accent"><Hourglass className="size-4" /> {marketing.next.eyebrow}</p>
          <h2 id="next-title" className="mt-2 text-xl sm:text-2xl">{marketing.next.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{marketing.next.body}</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
            {marketing.next.items.map((it) => (
              <li key={it.title} className="rounded-2xl bg-muted p-4">
                <span className="block font-display">{it.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{it.body}</span>
              </li>
            ))}
          </ul>
        </section>
        </Section>

        <Section id="developers">
        <section className="flex flex-col gap-4 rounded-3xl border border-border bg-muted p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8" aria-labelledby="dev-title">
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
        </Section>
          </PageSections>
        </div>
      </main>

      <footer className="border-t border-border px-5 pb-28 pt-8 sm:pb-8">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 text-sm text-muted-foreground">
          <span>{footerText(marketing.footer)}</span>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
