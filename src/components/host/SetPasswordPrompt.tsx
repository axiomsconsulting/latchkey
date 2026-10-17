import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth as authCopy, authExtraCopy as copy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";

/**
 * Once a free trial saved by email has confirmed it, offer a password (once).
 * Social sign-ins never see this; nor does anyone who already chose.
 */
export function SetPasswordPrompt() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = (u: { is_anonymous?: boolean; email?: string | null; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown> } | null | undefined) =>
      setOpen(!!u && !u.is_anonymous && !!u.email && !!u.email_confirmed_at && u.user_metadata?.["needs_password"] === true);
    void supabase.auth.getUser().then(({ data }) => check(data.user));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => check(s?.user));
    return () => data.subscription.unsubscribe();
  }, []);

  async function done(password: string | null) {
    setError(null);
    if (password !== null) {
      if (password.length < 8) return setError(copy.passwordShort);
      if (password !== again) return setError(copy.passwordMismatch);
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ ...(password ? { password } : {}), data: { needs_password: false } });
    setBusy(false);
    if (err) return setError(err.message || authCopy.genericError);
    setOpen(false);
    if (password) toast.success(copy.passwordSaved);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : setOpen(false))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.passwordTitle}</DialogTitle>
          <DialogDescription>{copy.passwordBody}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void done(pw);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="new-pw">{copy.password}</Label>
            <Input id="new-pw" type="password" autoComplete="new-password" className="h-12" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-pw2">{copy.passwordConfirm}</Label>
            <Input id="new-pw2" type="password" autoComplete="new-password" className="h-12" value={again} onChange={(e) => setAgain(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {copy.passwordSave}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void done(null)}>
              {copy.useLinks}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
