import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { SiteHeader } from "@/components/SiteHeader";
import { NO_TRACK, trackingOff } from "@/components/VisitTracker";
import { Switch } from "@/components/ui/switch";
import { privacyPageCopy as copy } from "@/content/copy";
import { rebrand } from "@/lib/brand";

/**
 * How this website counts its visitors, and a switch to stop it that this
 * browser remembers (the same as ?notrack=1). Browsers sending Global Privacy
 * Control or Do Not Track are never counted.
 */
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: rebrand("Privacy and website statistics — Latchkey") }, { name: "description", content: copy.intro }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  // Read after hydration: the server can't know this browser's choice.
  const [off, setOff] = useState<boolean | null>(null);
  const [browserSignal, setBrowserSignal] = useState(false);
  useEffect(() => {
    const n = navigator as Navigator & { globalPrivacyControl?: boolean };
    setBrowserSignal(n.globalPrivacyControl === true || n.doNotTrack === "1");
    setOff(trackingOff());
  }, []);

  function set(counted: boolean) {
    try {
      localStorage.setItem(NO_TRACK, counted ? "0" : "1");
    } catch {
      // Storage blocked: nothing is remembered, and nothing is counted either.
    }
    setOff(!counted);
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl space-y-8 px-5 pb-24 pt-6">
        <header>
          <h1 className="text-4xl">{copy.title}</h1>
          <p className="mt-3 text-lg text-muted-foreground">{copy.intro}</p>
        </header>

        <section className="card-soft space-y-3 p-5" aria-labelledby="switch">
          <h2 id="switch" className="text-xl">{copy.switchTitle}</h2>
          <label className="flex items-center justify-between gap-4">
            <span>{off === null ? copy.checking : off ? copy.offNow : copy.onNow}</span>
            <Switch checked={off === false} disabled={off === null || browserSignal} onCheckedChange={(v) => set(v)} aria-label={copy.switchLabel} />
          </label>
          {browserSignal ? <p className="text-sm text-muted-foreground">{copy.browserSignal}</p> : null}
          <p className="text-sm text-muted-foreground">{copy.switchHint}</p>
        </section>

        {copy.sections.map((s) => (
          <section key={s.title} className="space-y-2">
            <h2 className="text-xl">{s.title}</h2>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {s.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </section>
        ))}
        <p className="text-sm text-muted-foreground">{copy.guests}</p>
      </main>
    </div>
  );
}
