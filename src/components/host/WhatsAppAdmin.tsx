import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { common, whatsAppAdminCopy as copy } from "@/content/copy";
import { WHATSAPP_TEMPLATES } from "@/lib/guest-messages";
import {
  getHostWhatsApp,
  getWhatsAppAdmin,
  saveWhatsAppAdmin,
  setHostWhatsApp,
} from "@/lib/guest-messages.functions";

type Form = { sender: string; templates: Record<(typeof WHATSAPP_TEMPLATES)[number], string> };

/** Latchkey admin → Integrations: the shared WhatsApp number, the approved templates and how to set them up. */
export function WhatsAppAdmin() {
  const getFn = useServerFn(getWhatsAppAdmin);
  const saveFn = useServerFn(saveWhatsAppAdmin);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["whatsapp-admin"], queryFn: () => getFn() });
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    const f: Form = {
      sender: q.data.sender,
      templates: {
        photo_link: q.data.templates.photo_link ?? "",
        welcome: q.data.templates.welcome ?? "",
        goodbye: q.data.templates.goodbye ?? "",
      },
    };
    setForm(f);
    setSaved(f);
  }, [q.data]);
  if (!q.data || !form)
    return (
      <div className="card-soft grid place-items-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await saveFn({ data: form });
      await qc.invalidateQueries({ queryKey: ["whatsapp-admin"] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <MessageCircle className="size-5" aria-hidden /> {copy.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <SaveButton dirty={changed(form, saved)} busy={busy} onClick={() => void save()} />
      </div>
      {!q.data.twilio ? <p className="text-sm text-destructive">{copy.noTwilio}</p> : null}
      <div className="space-y-1">
        <Label htmlFor="wa-sender">{copy.sender}</Label>
        <Input
          id="wa-sender"
          value={form.sender}
          placeholder="+44…"
          onChange={(e) => setForm({ ...form, sender: e.target.value.trim() })}
        />
        <p className="text-xs text-muted-foreground">
          {copy.senderHint(form.sender ? null : q.data.effectiveSender)}
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{copy.templates}</p>
        {WHATSAPP_TEMPLATES.map((k) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`wa-${k}`} className="text-xs text-muted-foreground">
              {copy.template[k]}
            </Label>
            <Input
              id={`wa-${k}`}
              value={form.templates[k]}
              placeholder="HX…"
              className="font-mono"
              onChange={(e) =>
                setForm({ ...form, templates: { ...form.templates, [k]: e.target.value.trim() } })
              }
            />
          </div>
        ))}
      </div>
      <details className="rounded-xl border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">{copy.stepsTitle}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          {copy.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="mt-3 font-medium">{copy.ownTitle}</p>
        <p className="mt-1 text-muted-foreground">{copy.ownBody}</p>
      </details>
    </div>
  );
}

/** Latchkey admin → Businesses: the viewed business's own WhatsApp number. */
export function HostWhatsAppAdmin({ hostId }: { hostId: string }) {
  const getFn = useServerFn(getHostWhatsApp);
  const setFn = useServerFn(setHostWhatsApp);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["host-whatsapp", hostId],
    queryFn: () => getFn({ data: { hostId } }),
  });
  const [sender, setSender] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data?.available && q.data.number) setSender(q.data.number);
  }, [q.data]);
  if (!q.data?.available) return null;
  async function apply(value: string | null) {
    setBusy(true);
    try {
      await setFn({ data: { hostId, sender: value } });
      await qc.invalidateQueries({ queryKey: ["host-whatsapp", hostId] });
      toast.success(copy.hostSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  const d = q.data;
  return (
    <div className="card-soft space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg">
        <MessageCircle className="size-5" aria-hidden /> {copy.hostTitle}
      </h2>
      <p className="text-sm text-muted-foreground">
        {d.status === "live" && d.number
          ? copy.hostLive(d.number)
          : d.status === "requested" && d.number
            ? copy.hostAsked(d.number)
            : copy.hostNone}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={sender}
          placeholder={copy.hostNumber}
          aria-label={copy.hostNumber}
          className="max-w-xs"
          onChange={(e) => setSender(e.target.value.trim())}
        />
        <Button
          size="sm"
          disabled={busy || !/^\+[1-9]\d{7,14}$/.test(sender)}
          onClick={() => void apply(sender)}
        >
          {copy.hostSave}
        </Button>
        {d.status !== "none" ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void apply(null)}>
            {copy.hostRemove}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
