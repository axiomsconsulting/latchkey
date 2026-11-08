import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pause, Play, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountCopy as copy, common } from "@/content/copy";
import { accountActions, type AccountAction } from "@/lib/account-state";
import { changeAccountState, getAccountState } from "@/lib/account.functions";
import { formatUkDate } from "@/lib/dates";

/**
 * Pause, resume, close or reopen a business (rules in src/lib/account-state.ts).
 * The owner sees it on Billing and the lock screen; Latchkey admin in Businesses.
 * `bare` drops the card and heading (inside another card).
 */
export function AccountControls({ hostId, bare = false }: { hostId: string; bare?: boolean }) {
  const load = useServerFn(getAccountState);
  const change = useServerFn(changeAccountState);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["account-state", hostId],
    queryFn: () => load({ data: { hostId } }),
    enabled: !!hostId,
  });
  const [ask, setAsk] = useState<"pause" | "close" | null>(null);
  const [reason, setReason] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState<AccountAction | null>(null);
  const d = q.data;
  if (!d?.available) return null;
  const who = { owner: d.owner, admin: d.admin };
  const can = accountActions(d.state, who);
  const adminOnly = d.admin && !d.owner;

  async function run(action: AccountAction) {
    setBusy(action);
    try {
      await change({
        data: {
          hostId,
          action,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(action === "close" ? { confirm: word.trim().toUpperCase() } : {}),
        },
      });
      toast.success(copy.done[action]);
      setAsk(null);
      setReason("");
      setWord("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["account-state", hostId] }),
        qc.invalidateQueries({ queryKey: ["workspace"] }),
        qc.invalidateQueries({ queryKey: ["billing"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  const s = d.state;
  const status = s.closed_at
    ? copy.closed(formatUkDate(s.closed_at.slice(0, 10)))
    : s.suspended_at
      ? s.suspend_source === "admin"
        ? copy.pausedByLatchkey(formatUkDate(s.suspended_at.slice(0, 10)))
        : copy.paused(formatUkDate(s.suspended_at.slice(0, 10)))
      : null;
  const why = s.closed_at ? s.close_reason : s.suspended_at ? s.suspend_reason : null;

  const body = (
    <>
      {status ? (
        <p className="font-medium">
          {status} {why ? <span className="text-muted-foreground">{copy.reason(why)}</span> : null}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {can.resume ? (
          <Button variant="accent" disabled={busy !== null} onClick={() => void run("resume")}>
            {busy === "resume" ? <Loader2 className="animate-spin" /> : <Play />}
            {copy.resume}
          </Button>
        ) : null}
        {can.reopen ? (
          <Button variant="outline" disabled={busy !== null} onClick={() => void run("reopen")}>
            {busy === "reopen" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            {copy.reopen}
          </Button>
        ) : null}
        {can.pause ? (
          <Button variant="outline" disabled={busy !== null} onClick={() => setAsk("pause")}>
            <Pause /> {copy.pause}
          </Button>
        ) : null}
        {can.close ? (
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={busy !== null}
            onClick={() => setAsk("close")}
          >
            <XCircle /> {copy.close}
          </Button>
        ) : null}
      </div>
      <Dialog open={ask !== null} onOpenChange={(o) => (o ? null : setAsk(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ask === "close" ? copy.closeTitle : copy.pauseTitle}</DialogTitle>
            <DialogDescription>
              {ask === "close" ? copy.closeBody : copy.pauseBody}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="account-reason">
              {adminOnly ? copy.reasonLabel : copy.reasonOptional}
            </Label>
            <Input
              id="account-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {ask === "close" ? (
            <Input
              aria-label="CLOSE"
              placeholder="CLOSE"
              value={word}
              autoCapitalize="characters"
              onChange={(e) => setWord(e.target.value)}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsk(null)}>
              {common.cancel}
            </Button>
            <Button
              variant={ask === "close" ? "destructive" : "default"}
              disabled={
                busy !== null ||
                (adminOnly && !reason.trim()) ||
                (ask === "close" && word.trim().toUpperCase() !== "CLOSE")
              }
              onClick={() => ask && void run(ask)}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {ask === "close" ? copy.confirmClose : copy.confirmPause}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
  if (bare) return <div className="space-y-3">{body}</div>;
  return (
    <section className="card-soft space-y-3 p-6" data-tour="account-controls">
      <h2 className="text-xl">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.intro}</p>
      {body}
    </section>
  );
}
