import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, KeyRound, LayoutDashboard } from "lucide-react";

import { SiteHeader } from "@/components/SiteHeader";
import { demoCopy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { sessionUtm, type Utm } from "@/lib/attribution";
import { SHOWCASE } from "@/lib/demo-showcase";

/** /demo: both demos as plain links, for anyone who lands here first. */
export const Route = createFileRoute("/demo/")({
  head: () => ({
    meta: [
      { title: rebrand("Try the demo — Latchkey") },
      { name: "description", content: demoCopy.pageBody },
      { name: "robots", content: "index" },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  // Read after hydration, so the server's and the browser's links match first.
  const [utm, setUtm] = useState<Utm>({});
  useEffect(() => setUtm(sessionUtm()), []);
  const card = "spring flex min-h-24 w-full items-center gap-4 rounded-3xl border border-border bg-card p-5 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-xl space-y-6 px-5 py-10">
        <h1 className="text-4xl">{demoCopy.pageTitle}</h1>
        <p className="text-lg text-muted-foreground">{demoCopy.pageBody}</p>
        <Link to="/tour" search={utm as never} className={card}>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary"><KeyRound className="size-6" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg">{demoCopy.guestTitle}</span>
            <span className="block text-sm text-muted-foreground">{demoCopy.guestBody}</span>
          </span>
          <ArrowRight className="size-5 text-muted-foreground" />
        </Link>
        <Link to="/demo/host" search={utm as never} className={card}>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary"><LayoutDashboard className="size-6" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg">{demoCopy.hostTitle}</span>
            <span className="block text-sm text-muted-foreground">{demoCopy.hostBody}</span>
          </span>
          <ArrowRight className="size-5 text-muted-foreground" />
        </Link>
        {/* The regional demos: one property on each of the four hotel themes. */}
        <section className="space-y-3" aria-labelledby="regions">
          <h2 id="regions" className="text-2xl">{demoCopy.regionsTitle}</h2>
          <p className="text-muted-foreground">{demoCopy.regionsBody}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {SHOWCASE.map((r) => (
              <li key={r.key} className="card-soft space-y-2 p-4">
                <p className="font-display text-lg leading-tight">{r.property.name}</p>
                <p className="text-sm text-muted-foreground">{r.label} · {r.themeName}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link to="/tour/$region" params={{ region: r.key }} search={utm as never} className="rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">{demoCopy.asGuest}</Link>
                  <Link to="/demo/host/$region" params={{ region: r.key }} search={utm as never} className="rounded-full border border-border px-3 py-1.5 text-sm font-medium">{demoCopy.asHost}</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <p className="text-sm text-muted-foreground">{demoCopy.resetNote}</p>
      </main>
    </div>
  );
}
