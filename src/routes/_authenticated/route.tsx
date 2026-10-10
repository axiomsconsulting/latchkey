import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { startDemo } from "@/lib/demo.functions";

/** Shared demo browsers silently sign the demo account back in instead of bouncing to /auth. */
async function resumeDemo() {
  if (localStorage.getItem("latchkey-demo") !== "1") return null;
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
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return { user: data.user };
    const user = await resumeDemo();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});
