import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Users } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { common, team as copy } from "@/content/copy";
import { INVITE_ROLES, type InviteRole } from "@/lib/roles";
import {
  changeRole,
  inviteMember,
  leaveHost,
  listTeam,
  removeMember,
  resendInvite,
  revokeInvite,
} from "@/lib/team.functions";

type Confirm = { kind: "remove"; userId: string; email: string } | { kind: "leave" } | null;

/** Settings → Team. Owners manage it; everyone else sees who is on it. */
export function TeamPanel({ hostId, isOwner, demo }: { hostId: string; isOwner: boolean; demo: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listTeam);
  const invite = useServerFn(inviteMember);
  const resend = useServerFn(resendInvite);
  const revoke = useServerFn(revokeInvite);
  const setRole = useServerFn(changeRole);
  const remove = useServerFn(removeMember);
  const leave = useServerFn(leaveHost);
  const team = useQuery({ queryKey: ["team", hostId], queryFn: () => list({ data: { hostId } }) });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setNewRole] = useState<InviteRole>("manager");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const manage = isOwner && !demo;

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["team", hostId] });
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy("invite");
    try {
      const res = await invite({ data: { hostId, email, role } });
      await qc.invalidateQueries({ queryKey: ["team", hostId] });
      if (res.emailed) toast.success(copy.sent);
      else toast.warning(copy.notEmailed);
      setInviteOpen(false);
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  async function onConfirm() {
    if (!confirm) return;
    if (confirm.kind === "remove") {
      await act(`remove-${confirm.userId}`, () => remove({ data: { hostId, userId: confirm.userId } }));
    } else if (await act("leave", () => leave({ data: { hostId } }))) {
      // Back to whichever host is left (or a fresh workspace).
      await qc.resetQueries();
    }
    setConfirm(null);
  }

  const members = team.data?.members ?? [];
  const invites = team.data?.invites ?? [];

  return (
    <section className="card-soft p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <Users className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {manage ? <Button onClick={() => setInviteOpen(true)}>{copy.invite}</Button> : null}
      </div>

      {demo ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" /> {copy.demoLocked}
        </p>
      ) : !isOwner ? (
        <p className="mt-4 text-sm text-muted-foreground">{copy.readOnlyList}</p>
      ) : null}

      {team.isLoading ? (
        <Loader2 className="mt-4 size-5 animate-spin text-muted-foreground" />
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1 truncate">
                {m.email}
                {m.isYou ? <span className="ml-2 text-xs text-muted-foreground">({copy.you})</span> : null}
              </span>
              {manage && !m.isYou ? (
                <>
                  <Select
                    value={m.role}
                    onValueChange={(v) =>
                      void act(`role-${m.userId}`, () => setRole({ data: { hostId, userId: m.userId, role: v as InviteRole } }))
                    }
                    disabled={busy !== null}
                  >
                    <SelectTrigger className="h-10 w-36" aria-label={`${copy.roleLabel}: ${m.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{copy.roles[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setConfirm({ kind: "remove", userId: m.userId, email: m.email })}>
                    {copy.remove}
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">{copy.roles[m.role]}</span>
              )}
            </li>
          ))}
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{i.email}</span>
              <span className="text-sm text-muted-foreground">
                {copy.roles[i.role]} · {i.expired ? copy.expired : copy.pending}
              </span>
              {manage ? (
                <>
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void act(`resend-${i.id}`, () => resend({ data: { inviteId: i.id } }), copy.resent)}>
                    {busy === `resend-${i.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
                    {copy.resend}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void act(`revoke-${i.id}`, () => revoke({ data: { inviteId: i.id } }))}>
                    {copy.revoke}
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!isOwner && !demo ? (
        <Button variant="outline" className="mt-2" onClick={() => setConfirm({ kind: "leave" })}>
          {copy.leave}
        </Button>
      ) : null}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{copy.inviteTitle}</DialogTitle>
            <DialogDescription>{copy.inviteBody}</DialogDescription>
          </DialogHeader>
          <form onSubmit={sendInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">{copy.emailLabel}</Label>
              <Input id="invite-email" type="email" required className="h-12" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{copy.roleLabel}</legend>
              {INVITE_ROLES.map((r) => (
                <label key={r} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-secondary">
                  <input type="radio" name="invite-role" value={r} checked={role === r} onChange={() => setNewRole(r)} className="mt-1" />
                  <span>
                    <span className="block font-medium">{copy.roles[r]}</span>
                    <span className="block text-sm text-muted-foreground">{copy.roleHints[r]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" className="w-full" disabled={busy === "invite"}>
              {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : null}
              {copy.send}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => (o ? null : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "remove" ? copy.removeTitle(confirm.email) : copy.leaveTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.kind === "remove" ? copy.removeBody : copy.leaveBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onConfirm()}>{confirm?.kind === "remove" ? copy.remove : copy.leave}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
