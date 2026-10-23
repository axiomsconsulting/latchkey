import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { SaveButton } from "@/components/host/SaveButton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { common, privacyCopy as copy } from "@/content/copy";
import { DETAIL_DAY_CHOICES, MESSAGE_DAY_CHOICES, type Privacy } from "@/lib/privacy";
import { getPrivacy, savePrivacy } from "@/lib/privacy.functions";

/** Settings → Privacy: how long guests' details and messages are kept, and what else is kept by whose rule. */
export function PrivacySettings({ hostId, isOwner }: { hostId: string; isOwner: boolean }) {
  const fetchFn = useServerFn(getPrivacy);
  const saveFn = useServerFn(savePrivacy);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["privacy", hostId], queryFn: () => fetchFn({ data: { hostId } }) });
  const [form, setForm] = useState<Privacy | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setForm(q.data.privacy);
  }, [q.data]);

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await saveFn({ data: { hostId, ...form } });
      await qc.invalidateQueries({ queryKey: ["privacy", hostId] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const editable = isOwner && !!q.data?.available;
  const changed = !!form && !!q.data && (form.guestDetailsDays !== q.data.privacy.guestDetailsDays || form.messagesDays !== q.data.privacy.messagesDays);

  return (
    <section id="settings-privacy" className="card-soft scroll-mt-24 space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {isOwner ? <SaveButton dirty={changed && editable} busy={busy} onClick={() => void save()} /> : null}
      </div>

      {form ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{copy.details}</Label>
            <Select value={String(form.guestDetailsDays)} disabled={!editable} onValueChange={(v) => setForm((f) => f && { ...f, guestDetailsDays: Number(v) as Privacy["guestDetailsDays"] })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DETAIL_DAY_CHOICES.map((d) => <SelectItem key={d} value={String(d)}>{copy.afterDays(d)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{copy.detailsHelp}</p>
          </div>
          <div className="space-y-1">
            <Label>{copy.messages}</Label>
            <Select value={String(form.messagesDays)} disabled={!editable} onValueChange={(v) => setForm((f) => f && { ...f, messagesDays: Number(v) as Privacy["messagesDays"] })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESSAGE_DAY_CHOICES.map((d) => <SelectItem key={d} value={String(d)}>{d === 0 ? copy.keepMessages : copy.afterDays(d)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{copy.messagesHelp}</p>
          </div>
        </div>
      ) : null}
      {q.data && !q.data.available ? <p className="text-sm text-muted-foreground">{copy.notReady}</p> : null}
      {isOwner ? null : <p className="text-xs text-muted-foreground">{copy.ownerOnly}</p>}

      <div className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">{copy.otherTitle}</h3>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            {copy.idPhotos}{" "}
            <Link to="/app/settings" search={{ focus: "records" }} className="font-medium text-primary underline-offset-2 hover:underline">{copy.idPhotosLink}</Link>
          </li>
          <li>
            {copy.register}{" "}
            <Link to="/app/register" className="font-medium text-primary underline-offset-2 hover:underline">{copy.registerLink}</Link>
          </li>
          {copy.fixed.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </section>
  );
}
