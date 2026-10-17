import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck } from "lucide-react";

import { SocialButtons } from "@/components/SocialButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth as authCopy, authExtraCopy as copy, trial as trialCopy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import { supabase } from "@/integrations/supabase/client";
import { signInIntent } from "@/lib/social-auth";
import { saveTrialDetails } from "@/lib/team.functions";
import { saveTrialName } from "@/lib/trial.functions";

/**
 * Saving a free trial, once the property is set up: Google, Apple, or an
 * email link. No password now. Email keeps the same account (it gets the
 * email; a password is offered once it's confirmed). Google/Apple hand the
 * trial over to the account they sign in with.
 */
export function SaveTrial({ next = "/app/today", onLater }: { next?: string; onLater?: () => void }) {
  const ws = useWorkspace();
  const saveDetails = useServerFn(saveTrialDetails);
  const saveName = useServerFn(saveTrialName);
  const qc = useQueryClient();
  const contact = (ws.data?.host as { contact_email?: string | null } | null | undefined)?.contact_email ?? "";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (contact && !email) setEmail(contact);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact]);

  // Their name goes with whichever way they save.
  const keepName = async () => {
    if (name.trim()) await saveName({ data: { name: name.trim() } }).catch(() => undefined);
  };

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const to = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return setError(trialCopy.needEmail);
    setBusy(true);
    setError(null);
    try {
      await keepName();
      // The lead is kept on the business straight away, even before the link is opened.
      if (ws.data?.hostId && name.trim()) await saveDetails({ data: { hostId: ws.data.hostId, name: name.trim(), email: to } }).catch(() => undefined);
      signInIntent("email_link");
      const { error: err } = await supabase.auth.updateUser(
        { email: to, data: { needs_password: true, ...(name.trim() ? { full_name: name.trim() } : {}) } },
        { emailRedirectTo: `${window.location.origin}${next}` },
      );
      if (err) {
        setError(/already|registered|exists/i.test(err.message) ? trialCopy.bannerTaken : err.message || authCopy.genericError);
        return;
      }
      setSent(to);
      await qc.invalidateQueries({ queryKey: ["workspace"] });
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="flex items-start gap-3 rounded-2xl bg-secondary p-4">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <span>{copy.linkSent(sent)}</span>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="save-name">{copy.yourName}</Label>
        <Input id="save-name" className="h-12" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </div>
      <div onClickCapture={() => void keepName()}>
        <SocialButtons next={next} />
      </div>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {copy.orEmail}
        <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={sendLink} className="space-y-2">
        <Label htmlFor="save-email">{trialCopy.bannerEmail}</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="save-email" type="email" autoComplete="email" className="h-12 min-w-56 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="h-12" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.sendLink}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{copy.emailHint}</p>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {onLater ? (
        <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={onLater}>
          {copy.later}
        </button>
      ) : null}
    </div>
  );
}
