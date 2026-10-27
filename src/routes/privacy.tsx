import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/LegalPage";
import { Switch } from "@/components/ui/switch";
import { privacyPageCopy as copy } from "@/content/copy";
import { privacyPolicy } from "@/content/legal";
import { rebrand } from "@/lib/brand";
import { browserSaysNo, consentState, onConsent, setConsent } from "@/lib/consent";
import { captureAfterConsent } from "@/lib/attribution";
import { getLegalDetails } from "@/lib/site.functions";

/**
 * The Privacy policy (wording in src/content/legal.ts), with the website
 * cookie choice switch in its "Website statistics" section (#statistics):
 * the same consent as the cookie banner (src/lib/consent.ts), and browsers
 * sending Global Privacy Control or Do Not Track are never counted.
 */
export const Route = createFileRoute("/privacy")({
  loader: () => getLegalDetails(),
  head: () => ({
    meta: [
      { title: rebrand("Privacy policy — Latchkey") },
      { name: "description", content: copy.intro },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      doc={privacyPolicy(Route.useLoaderData())}
      extra={{ statistics: <StatisticsSwitch /> }}
    />
  );
}

function StatisticsSwitch() {
  // Read after hydration: the server can't know this browser's choice.
  const [off, setOff] = useState<boolean | null>(null);
  const [browserSignal, setBrowserSignal] = useState(false);
  useEffect(() => {
    setBrowserSignal(browserSaysNo());
    setOff(consentState() !== "yes");
    return onConsent((c) => setOff(c !== "yes"));
  }, []);

  function set(counted: boolean) {
    setConsent(counted ? "yes" : "no");
    if (counted) captureAfterConsent();
  }

  return (
    <div className="card-soft mt-3 space-y-3 p-5 print:hidden">
      <p className="font-medium">{copy.switchTitle}</p>
      <label className="flex items-center justify-between gap-4">
        <span>{off === null ? copy.checking : off ? copy.offNow : copy.onNow}</span>
        <Switch
          checked={off === false}
          disabled={off === null || browserSignal}
          onCheckedChange={(v) => set(v)}
          aria-label={copy.switchLabel}
        />
      </label>
      {browserSignal ? <p className="text-sm text-muted-foreground">{copy.browserSignal}</p> : null}
      <p className="text-sm text-muted-foreground">{copy.switchHint}</p>
    </div>
  );
}
