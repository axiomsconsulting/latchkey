import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { cookieCopy as copy } from "@/content/copy";
import { captureAfterConsent } from "@/lib/attribution";
import { bannerPath, consentState, onConsent, setConsent } from "@/lib/consent";

/**
 * Asks once (then every 12 months) whether website statistics and the
 * Commission Partner referral cookie may be used. Accept and Reject are the
 * same size and style, nothing optional runs until Accept, and the choice can
 * be changed on /privacy#statistics. Only on our own site and the dashboard
 * (bannerPath), never on guests' pages or a door tablet, and not while
 * printing.
 */
export function CookieBanner() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Read after hydration: the server can't know this browser's choice.
  const [unset, setUnset] = useState(false);
  useEffect(() => {
    setUnset(consentState() === "unset");
    return onConsent(() => setUnset(false));
  }, []);

  if (!unset || !bannerPath(path)) return null;

  function choose(yes: boolean) {
    setConsent(yes ? "yes" : "no");
    if (yes) captureAfterConsent();
  }

  return (
    <section
      role="region"
      aria-label={copy.label}
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-2xl border bg-card p-4 text-card-foreground shadow-lg print:hidden sm:bottom-4"
    >
      <p className="font-medium">{copy.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {copy.body}{" "}
        <a href="/privacy#statistics" className="text-primary underline-offset-2 hover:underline">
          {copy.more}
        </a>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => choose(false)}>
          {copy.reject}
        </Button>
        <Button variant="outline" onClick={() => choose(true)}>
          {copy.accept}
        </Button>
      </div>
    </section>
  );
}
