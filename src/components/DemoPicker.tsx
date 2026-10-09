import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, LayoutDashboard, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { demoCopy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { startDemo } from "@/lib/demo.functions";

export function DemoPicker({ children, open, onOpenChange }: { children?: ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const run = useServerFn(startDemo);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"host" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(as: "host" | "guest") {
    setBusy(as);
    setError(null);
    try {
      const res = await run({ data: { as } });
      if (as === "guest") {
        await navigate({ to: "/p/$code", params: { code: res.code } });
        return;
      }
      await supabase.auth.signOut();
      const { error: e } = await supabase.auth.verifyOtp({ token_hash: res.tokenHash!, type: "magiclink" });
      if (e) throw e;
      await navigate({ to: "/app/today" });
    } catch {
      setError(demoCopy.error);
    } finally {
      setBusy(null);
    }
  }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
