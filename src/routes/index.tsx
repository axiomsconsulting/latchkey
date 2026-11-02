import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BedDouble,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  DoorOpen,
  Inbox,
  LayoutDashboard,
  MessagesSquare,
  MoonStar,
  Palette,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChannelBadge } from "@/components/ChannelBadge";
import { brand, marketing } from "@/content/copy";
import { OfferRibbon, PricingSection } from "@/components/PricingSection";
import { sessionUtm, type Utm } from "@/lib/attribution";
import { LegalLinks } from "@/components/LegalPage";
import { HomeArt } from "@/components/HomeArt";
import { DEFAULT_HOME_GLASS, glassVars, type HomeArtSlot } from "@/lib/home-art";
import { useSite } from "@/hooks/use-site";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspace } from "@/lib/host.functions";
import { partnerIntent } from "@/lib/partner-intent";
import { canWrite } from "@/lib/roles";
import { HOME_REDIRECT_SCRIPT, rememberDashboard } from "@/lib/home-redirect";
import { footerText } from "@/lib/brand";
import { PageSections, Section } from "@/components/PageSections";
import { rebrand } from "@/lib/brand";
import { getPricing } from "@/lib/pricing.functions";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  // ?home=1 shows this page even to a signed-in host (the logo and "Home" link use it).
  validateSearch: (search: Record<string, unknown>): { home?: boolean } =>
    search["home"] === true || search["home"] === "1" || search["home"] === 1 ? { home: true } : {},
  head: () => ({
    meta: [
      { title: rebrand("Latchkey — guest operations for independent accommodation") },
      { name: "description", content: marketing.subhead },
      {
        property: "og:title",
        content: rebrand("Latchkey — guest operations for independent accommodation"),
      },
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

/** Each section's background picture slot (Latchkey admin → Home page pictures). */
const ART: Record<string, HomeArtSlot> = {
  outcomes: "benefits",
  gap: "why",
  stay: "journey",
  included: "pillars",
  audience: "audience",
  plans: "pricing",
};

/** A short visible line that opens to the detail: keeps the page light, the facts a tap away. */
function Unfold({
  summary,
  children,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

function Landing() {
  const { home } = Route.useSearch();
  const navigate = useNavigate();
  // The session's utm_* on the demo and trial links, read after hydration.
  const [utm, setUtm] = useState<Utm>({});
  useEffect(() => setUtm(sessionUtm()), []);
  // The boxes as frosted glass over the background photos, as the Latchkey admin set it.
  const glass = useSite()?.homeGlass ?? DEFAULT_HOME_GLASS;
  // The trial's length, as the super admin set it (shared with the pricing section).
  const fetchPricing = useServerFn(getPricing);
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => fetchPricing() });
  const days = (pricing.data ?? DEFAULT_PRICING).trial_days;

  // Hosts and managers who are signed in go straight to their dashboard.
  useEffect(() => {
    if (home) return;
    let live = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session || !live) return;
      try {
        const ws = await getWorkspace({ data: { asPartner: partnerIntent() } });
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

  const touch = "pointer-coarse:h-14 pointer-coarse:px-7 pointer-coarse:text-base";
  // One main action (the trial) and one way to see it first; the host demo is a quieter link.
  const actions = (
    <>
      <div className="flex flex-wrap gap-3">
        {/* Real links (shareable, crawlable); the session's utm_* go along. */}
        <Button asChild size="lg" variant="accent" className={touch}>
          <Link to="/start" search={utm as never}>
            {marketing.trialCta}
            <ArrowRight />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className={touch}>
          <Link to="/tour" search={utm as never}>
            {marketing.tourCta}
          </Link>
        </Button>
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {marketing.reassure(days).map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <Check className="size-4 text-primary" aria-hidden /> {r}
          </span>
        ))}
        <Link
          to="/demo/host"
          search={utm as never}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {marketing.hostCta} →
        </Link>
      </p>
    </>
  );

  return (
    // isolate: the home page's background photos sit behind everything; overflow-x-clip: their full width never scrolls sideways.
    // data-home-glass: the boxes as frosted glass over the photos (Latchkey admin's choice; styles.css).
    <div
      className="isolate min-h-screen overflow-x-clip bg-background"
      data-home-glass={glass.on ? "on" : "off"}
      style={glassVars(glass) as React.CSSProperties}
    >
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-5 pb-24">
        {/* Above the fold: what it does, for whom, one main action and one way to see it. */}
        <section className="relative pb-14 pt-8 sm:pb-20 sm:pt-14">
          {/* The super admin's photo, faint, behind the headline (Latchkey admin → Site settings → Home page pictures). */}
          <HomeArt slot="hero" />
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
            {brand.tagline}
          </p>
          <h1 className="mt-4 max-w-4xl text-balance text-4xl leading-[1.05] sm:text-6xl lg:text-7xl">
            {marketing.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {marketing.subhead}
          </p>
          <div className="mt-9">{actions}</div>
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

        {/* Below the headline, in the order the super admin chose (Latchkey admin → Menu and pages). */}
        <div className="space-y-16">
          <PageSections
            page="home"
            decorate={(id) => (ART[id] ? <HomeArt slot={ART[id]} /> : null)}
          >
            <Section id="outcomes">
              <section className="grid gap-5 sm:grid-cols-3">
                {marketing.benefits.map((benefit, i) => {
                  const Icon = benefitIcons[i] ?? Sparkles;
                  return (
                    <article key={benefit.title} className="card-soft p-6">
                      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
                        <Icon className="size-6" />
                      </span>
                      <h2 className="mt-5 text-xl">{benefit.title}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {benefit.body}
                      </p>
                    </article>
                  );
                })}
              </section>
            </Section>

            {/* The gap in the market, in a glance; the full side-by-side folded away. */}
            <Section id="gap">
              <section aria-labelledby="gap-title">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                  {marketing.gap.eyebrow}
                </p>
                <h2
                  id="gap-title"
                  className="mt-3 max-w-3xl text-balance text-2xl leading-tight sm:text-3xl"
                >
                  {marketing.gap.title}
                </h2>
                <p className="mt-2 max-w-2xl text-muted-foreground">{marketing.gap.body}</p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-border bg-muted p-6">
                    <h3 className="text-lg">{marketing.gap.keepTitle}</h3>
                    <ul className="mt-3 space-y-2">
                      {marketing.gap.keep.map((k) => (
                        <li key={k} className="flex gap-2 text-sm text-muted-foreground">
                          <Check className="mt-0.5 size-4 shrink-0" /> {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-3xl bg-primary p-6 text-primary-foreground">
                    <h3 className="text-lg">{marketing.gap.oursTitle}</h3>
                    <ul className="mt-3 space-y-2">
                      {marketing.gap.ours.map((k) => (
                        <li key={k} className="flex gap-2 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-accent" /> {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <Unfold
                  className="card-soft mt-4 px-6 py-4"
                  summary={<span className="font-medium">{marketing.gap.compare}</span>}
                >
                  <dl className="divide-y divide-border">
                    <div className="hidden grid-cols-[10rem_1fr_1fr] gap-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                      <span />
                      <span>{marketing.gap.theyLabel}</span>
                      <span className="text-primary">{marketing.gap.usLabel}</span>
                    </div>
                    {marketing.gap.rows.map((r) => (
                      <div
                        key={r.topic}
                        className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr_1fr] sm:gap-4"
                      >
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
                  <p className="mt-3 text-sm text-muted-foreground">{marketing.gap.note}</p>
                </Unfold>
              </section>
            </Section>

            <Section id="stay">
              <section aria-labelledby="journey-title">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                  {marketing.journey.eyebrow}
                </p>
                <h2
                  id="journey-title"
                  className="mt-3 max-w-3xl text-balance text-2xl leading-tight sm:text-3xl"
                >
                  {marketing.journey.title}
                </h2>
                <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {marketing.journey.steps.map((st, i) => {
                    const Icon = journeyIcons[i] ?? Sparkles;
                    return (
                      <li key={st.title} className="card-soft flex gap-4 p-5 lg:flex-col lg:gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                          <Icon className="size-5" />
                        </span>
                        <span>
                          <span className="block text-xs font-semibold uppercase tracking-wide text-accent">
                            {i + 1}
                          </span>
                          <span className="block font-display text-lg leading-tight">
                            {st.title}
                          </span>
                          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                            {st.body}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <div className="mt-5">
                  <Button asChild variant="outline">
                    <Link to="/tour" search={utm as never}>
                      {marketing.tourCta} <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </section>
            </Section>

            {/* What's included: one line each, the detail a tap away. */}
            <Section id="included">
              <section aria-labelledby="pillars-title">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                  {marketing.pillars.eyebrow}
                </p>
                <h2 id="pillars-title" className="mt-3 text-2xl leading-tight sm:text-3xl">
                  {marketing.pillars.title}
                </h2>
                <div className="mt-6 grid items-start gap-4 md:grid-cols-2">
                  {marketing.pillars.items.map((p, i) => {
                    const Icon = pillarIcons[i] ?? Sparkles;
                    return (
                      <Unfold
                        key={p.title}
                        className="card-soft p-5"
                        summary={
                          <span className="flex items-start gap-3">
                            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
                              <Icon className="size-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-display text-xl">{p.title}</span>
                              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                                {p.summary}
                              </span>
                            </span>
                          </span>
                        }
                      >
                        <ul className="space-y-2 border-t border-border pt-4">
                          {p.points.map((pt) => (
                            <li key={pt} className="flex gap-2 text-sm leading-relaxed">
                              <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {pt}
                            </li>
                          ))}
                        </ul>
                      </Unfold>
                    );
                  })}
                </div>
              </section>
            </Section>

            <Section id="audience">
              <section
                className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 sm:p-8 lg:flex-row lg:items-center"
                aria-labelledby="audience-title"
              >
                <h2 id="audience-title" className="shrink-0 text-xl lg:w-64">
                  {marketing.audience.title}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {marketing.audience.kinds.map((k) => (
                    <li
                      key={k}
                      className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground"
                    >
                      {k}
                    </li>
                  ))}
                </ul>
              </section>
            </Section>

            <Section id="plans">
              <PricingSection />
            </Section>
          </PageSections>

          {/* The invitation, always last. */}
          <section
            className="rounded-3xl bg-primary p-8 text-primary-foreground shadow-lifted sm:p-12"
            aria-labelledby="closing-title"
          >
            <h2
              id="closing-title"
              className="max-w-3xl text-balance text-3xl leading-tight sm:text-4xl"
            >
              {marketing.closing.title}
            </h2>
            <p className="mt-3 max-w-2xl opacity-90">{marketing.closing.body}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent" className={touch}>
                <Link to="/start" search={utm as never}>
                  {marketing.trialCta}
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className={cn(
                  touch,
                  "border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground",
                )}
              >
                <Link to="/tour" search={utm as never}>
                  {marketing.tourCta}
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm opacity-80">{marketing.reassure(days).join(" · ")}</p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border px-5 pb-28 pt-8 sm:pb-8">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 text-sm text-muted-foreground">
          <span>{footerText(marketing.footer)}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/developers" className="underline-offset-2 hover:underline">
              {marketing.developersLink}
            </Link>
            <LegalLinks />
          </div>
        </div>
      </footer>
    </div>
  );
}
