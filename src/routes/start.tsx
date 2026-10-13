import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { trial as copy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_EMAIL, markDemo, signOut } from "@/lib/demo-session";

export const Route = createFileRoute("/start")({
  ssr: false,
  head: () => ({ meta: [{ title: "Start your free trial — Latchkey" }, { name: "robots", content: "noindex" }] }),
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
      <p className="flex items-center gap-3 text-lg text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" /> {copy.starting}
      </p>
    </main>
  );
}
