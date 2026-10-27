import { useEffect, useState } from "react";
import { Loader2, MailCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth as authCopy, trial as copy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import { SaveTrial } from "@/components/host/SaveTrial";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shown while someone is on a free trial without an account. Saving it adds
 * their email to the same (anonymous) user: once they open the link, they
 * are a normal host and everything they set up is already theirs.
 */
export function TrialBanner() {
  const [anonymous, setAnonymous] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ws = useWorkspace();
  const contact =
    (ws.data?.host as { contact_email?: string | null } | null | undefined)?.contact_email || null;

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setAnonymous(!!data.user?.is_anonymous));
    const { data } = supabase.auth.onAuthStateChange((_e, s) =>
      setAnonymous(!!s?.user?.is_anonymous),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  if (!anonymous) return null;
  const value = email ?? contact ?? "";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const to = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setError(copy.needEmail);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser(
        { email: to },
        { emailRedirectTo: `${window.location.origin}/app/today` },
      );
      if (err) {
        setError(
          /already|registered|exists/i.test(err.message)
            ? copy.bannerTaken
            : err.message || authCopy.genericError,
        );
        return;
      }
      setSent(to);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="trial-banner"
      className="mx-auto mb-6 w-full max-w-5xl rounded-2xl border border-accent/40 bg-accent/10 p-4 print:hidden"
    >
      {sent ? (
        <p className="flex items-start gap-3">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <span>{copy.bannerSent(sent)}</span>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles className="size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <h2 id="trial-banner" className="font-medium">
                {copy.bannerTitle}
              </h2>
              <p className="text-sm text-muted-foreground">{copy.bannerBody(contact)}</p>
            </div>
            {!open ? (
              <Button variant="accent" onClick={() => setOpen(true)}>
                {copy.bannerCta}
              </Button>
            ) : null}
          </div>
          {open ? (
            <div className="mt-4 max-w-xl">
              <SaveTrial onLater={() => setOpen(false)} />
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
