import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/LegalPage";
import { NO_TRACK, trackingOff } from "@/components/VisitTracker";
import { Switch } from "@/components/ui/switch";
import { privacyPageCopy as copy } from "@/content/copy";
import { privacyPolicy } from "@/content/legal";
import { rebrand } from "@/lib/brand";
import { getLegalDetails } from "@/lib/site.functions";

/**
 * The Privacy policy (wording in src/content/legal.ts), with the website
 * statistics switch in its "Website statistics" section (#statistics): this
 * browser remembers the choice (the same as ?notrack=1), and browsers
 * sending Global Privacy Control or Do Not Track are never counted.
 */
export const Route = createFileRoute("/privacy")({
  loader: () => getLegalDetails(),
  head: () => ({ meta: [{ title: rebrand("Privacy policy — Latchkey") }, { name: "description", content: copy.intro }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalPage doc={privacyPolicy(Route.useLoaderData())} extra={{ statistics: <StatisticsSwitch /> }} />;
}

function StatisticsSwitch() {
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
    <div className="card-soft mt-3 space-y-3 p-5 print:hidden">
      <p className="font-medium">{copy.switchTitle}</p>
      <label className="flex items-center justify-between gap-4">
        <span>{off === null ? copy.checking : off ? copy.offNow : copy.onNow}</span>
        <Switch checked={off === false} disabled={off === null || browserSignal} onCheckedChange={(v) => set(v)} aria-label={copy.switchLabel} />
      </label>
      {browserSignal ? <p className="text-sm text-muted-foreground">{copy.browserSignal}</p> : null}
      <p className="text-sm text-muted-foreground">{copy.switchHint}</p>
    </div>
  );
}
