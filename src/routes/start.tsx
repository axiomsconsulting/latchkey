import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/track";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { trial as copy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { getSiteSettings } from "@/lib/admin.functions";
import { DEMO_EMAIL, markDemo, signOut } from "@/lib/demo-session";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/start")({
  ssr: false,
  head: () => ({ meta: [{ title: rebrand("Start your free trial — Latchkey") }, { name: "robots", content: "noindex" }] }),
  component: StartTrial,
});

/**
 * "Start free trial": no sign-up form. The visitor gets an anonymous session
 * and goes straight to setting up their property; their email is asked for
 * there, and the account is saved (the same user, now with that email) when
 * they're ready. If anonymous sign-in is switched off, it falls back to the
 * usual registration page.
 */
function StartTrial() {
  const navigate = useNavigate();
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      // Someone already signed in (and not the shared demo) carries on as themselves.
      if (user && user.email !== DEMO_EMAIL) {
        if (live) await navigate({ to: "/app/setup", replace: true });
        return;
      }
      if (user) await signOut();
      trackEvent("trial_signup_started");
      // The super admin can pause new trials from the admin page.
      const site = await getSiteSettings().catch(() => null);
      if (site && !site.signups_open) {
        if (live) setClosed(true);
        return;
      }
      const { error } = await supabase.auth.signInAnonymously();
      if (!live) return;
      if (error) {
        console.warn("Anonymous sign-in unavailable, using registration instead:", error.message);
        await navigate({ to: "/auth", search: { mode: "sign_up" }, replace: true });
        return;
      }
      markDemo(false);
      await navigate({ to: "/app/setup", replace: true });
    })();
    return () => {
      live = false;
    };
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      {closed ? (
        <p className="max-w-md text-center text-lg">{copy.closed}</p>
      ) : (
        <p className="flex items-center gap-3 text-lg text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" /> {copy.starting}
        </p>
      )}
    </main>
  );
}
