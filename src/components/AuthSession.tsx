import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { authExtraCopy as copy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { clearTrialClaim, confirmSignIn, pendingTrialClaim, takeTokensFromUrl } from "@/lib/social-auth";
import { completeTrialClaim } from "@/lib/trial.functions";

/**
 * On every page: remembers how this device signed in (the "Last used"
 * badge), and when a free trial's visitor comes back from Google or Apple,
 * moves the trial's business to the account they signed in with.
 */
export function AuthSession() {
  const claim = useServerFn(completeTrialClaim);
  const qc = useQueryClient();

  useEffect(() => {
    let handled = false;
    const onSession = async (user: { is_anonymous?: boolean; email?: string | null; app_metadata?: { provider?: string } } | null | undefined) => {
      if (!user || user.is_anonymous) return;
      confirmSignIn(user);
      const code = pendingTrialClaim();
      if (!code || handled) return;
      handled = true;
      try {
        const r = await claim({ data: { code } });
        clearTrialClaim();
        if (r.moved) {
          await qc.invalidateQueries();
          toast.success(copy.trialSaved);
        }
      } catch {
        handled = false;
      }
    };
    void takeTokensFromUrl().then(() => supabase.auth.getSession().then(({ data }) => onSession(data.session?.user)));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") void onSession(session?.user);
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
