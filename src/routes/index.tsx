import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Minus, ScanLine, Sparkles, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChannelBadge } from "@/components/ChannelBadge";
import { brand, marketing } from "@/content/copy";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Latchkey — self-service arrivals for small hosts" },
      { name: "description", content: marketing.subhead },
      { property: "og:title", content: "Latchkey — self-service arrivals for small hosts" },
      { property: "og:description", content: marketing.subhead },
    ],
  }),
  component: Landing,
});

const benefitIcons = [ScanLine, Layers, Sparkles];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary font-display text-lg text-primary-foreground">
            L
          </span>
          <span className="truncate font-display text-xl">{brand.name}</span>
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to="/app/today">Host dashboard</Link>
        </Button>
      </header>

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
            <Button asChild size="lg" variant="accent">
              <Link to="/p/demo">
                {marketing.primaryCta}
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/app/today">{marketing.secondaryCta}</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Works alongside</span>
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
            <h2 className="text-xl">{marketing.beforeAfter.beforeTitle}</h2>
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
            <h2 className="text-xl">{marketing.beforeAfter.afterTitle}</h2>
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
          {brand.name} — demo workspace for The Trinity Rooms, High Wycombe.
        </p>
      </footer>
    </div>
  );
}
