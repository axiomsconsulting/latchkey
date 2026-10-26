import { useEffect } from "react";
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { isDemoBrowser } from "@/lib/demo-session";
import { startDemo } from "@/lib/demo.functions";

/** Shared demo browsers silently sign the demo account back in instead of bouncing to /auth. */
async function resumeDemo() {
  if (!isDemoBrowser()) return null;
  try {
    const res = await startDemo({ data: { as: "host" } });
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: res.tokenHash!, type: "magiclink" });
    if (error) return null;
    return data.user;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return { user: data.user };
    const user = await resumeDemo();
    // Back to the page they asked for once signed in; partners get their own sign-in.
    if (!user)
      throw redirect({
        to: "/auth",
        search: {
          next: location.href,
          ...(location.pathname.startsWith("/partners") ? { for: "partner" as const } : {}),
        },
      });
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();
  // A demo session can also lapse while a page is open (refresh fails and
  // Supabase signs this tab out). Sign back in instead of leaving it broken.
  // A deliberate sign-out clears the demo flag first, so it is left alone.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT" || !isDemoBrowser()) return;
      void resumeDemo().then((user) => {
        if (user) void router.invalidate();
        else void router.navigate({ to: "/auth" });
      });
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
  return <Outlet />;
}
