/**
 * Browser side of the shared demo host account. Many visitors are signed in
 * as the same user at once, so leaving the demo must only end this browser's
 * session: a global sign-out would revoke every other visitor's session too.
 */
import { supabase } from "@/integrations/supabase/client";
import { DEMO_EMAIL } from "@/lib/demo-account";

export { DEMO_EMAIL };
const FLAG = "latchkey-demo";

export function markDemo(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {
    // Private mode: the demo just won't resume silently.
  }
}

export function isDemoBrowser(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

/** Signs out; only this device when it is the shared demo account. */
export async function signOut() {
  const { data } = await supabase.auth.getSession();
  const demo = data.session?.user.email === DEMO_EMAIL;
  markDemo(false);
  await supabase.auth.signOut(demo ? { scope: "local" } : undefined);
}
