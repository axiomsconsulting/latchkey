import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, LayoutDashboard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { demoCopy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { defaultCampaign, sessionUtm, withAttribution } from "@/lib/attribution";
import { rememberSelectedProperty } from "@/hooks/use-host-data";
import type { ShowcaseKey } from "@/lib/demo-showcase";
import { markDemo } from "@/lib/demo-session";
import { startDemo } from "@/lib/demo.functions";

/** Starts the shared demo as a guest (the real kiosk screen) or as a host (the dashboard). */
export function useDemo() {
  const run = useServerFn(startDemo);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"host" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(as: "host" | "guest", region?: ShowcaseKey) {
    setBusy(as);
    setError(null);
    try {
      const res = await run({ data: { as, ...(region ? { region } : {}) } });
      if (as === "guest") {
        // The real kiosk screen: a phone gets the phone version, a tablet or computer the door-tablet one.
        await navigate({ to: "/kiosk/$code", params: { code: res.code }, search: sessionUtm() });
        return;
      }
      // Local only: a global sign-out here would end every other demo visitor's session.
      await supabase.auth.signOut({ scope: "local" });
      const { error: e } = await supabase.auth.verifyOtp({ token_hash: res.tokenHash!, type: "magiclink" });
      if (e) throw e;
      markDemo(true);
      // A regional demo opens on its own property.
      if (res.propertyId) rememberSelectedProperty(res.propertyId);
      await navigate({ href: withAttribution("/app/today") });
    } catch {
      setError(demoCopy.error);
    } finally {
      setBusy(null);
    }
  }
  return { go, busy, error };
}

export function DemoPicker({ children, open, onOpenChange }: { children?: ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const { go, busy, error } = useDemo();

  const option = (as: "host" | "guest", icon: ReactNode, title: string, body: string) => (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => void go(as)}
      className="spring flex min-h-24 w-full items-center gap-4 rounded-3xl border border-border bg-card p-5 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
        {busy === as ? <Loader2 className="size-6 animate-spin" /> : icon}
      </span>
      <span>
        <span className="block font-display text-lg">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );

  return (
    <Dialog {...(open !== undefined ? { open } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{demoCopy.title}</DialogTitle>
          <DialogDescription>{demoCopy.body}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {option("guest", <KeyRound className="size-6" />, demoCopy.guestTitle, demoCopy.guestBody)}
          {option("host", <LayoutDashboard className="size-6" />, demoCopy.hostTitle, demoCopy.hostBody)}
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">{demoCopy.resetNote}</p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * /tour and /demo/host: open the demo straight away (the stable links for
 * posts and emails), with a calm wait and a way to try again.
 */
export function DemoLauncher({ as, region, campaign }: { as: "host" | "guest"; region?: ShowcaseKey; campaign?: string }) {
  const { go, error } = useDemo();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Each demo link has its own campaign name, unless the link brought its own tags.
    if (campaign) defaultCampaign(campaign);
    void go(as, region);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [as]);
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5">
      <div className="card-soft w-full max-w-md space-y-4 p-8 text-center">
        {error ? (
          <>
            <p role="alert" className="text-lg">{error}</p>
            <Button onClick={() => void go(as, region)}>{demoCopy.tryAgain}</Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
            <p className="font-display text-xl" role="status">{as === "guest" ? demoCopy.openingGuest : demoCopy.openingHost}</p>
          </>
        )}
        <p className="text-xs text-muted-foreground">{demoCopy.resetNote}</p>
      </div>
    </main>
  );
}
