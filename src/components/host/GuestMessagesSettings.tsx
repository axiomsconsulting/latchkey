import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { common, guestTextsCopy as copy } from "@/content/copy";
import {
  SAMPLE_VARS,
  fillMessage,
  smsInfo,
  type GuestMessagesSettings as Settings,
  type MessageChoice,
  type PhoneRoute,
} from "@/lib/guest-messages";
import {
  getGuestMessages,
  requestWhatsApp,
  saveGuestMessages,
  sendTestGuestMessage,
} from "@/lib/guest-messages.functions";
import { cn } from "@/lib/utils";

const VARS = ["name", "guide", "checkin", "checkout", "room", "property", "book"] as const;

/** One message: on/off, its time, its words with the length as one text, and how it reads. */
function MessageBox({
  label,
  value,
  onChange,
  property,
  origin,
}: {
  label: string;
  value: MessageChoice;
  onChange: (v: MessageChoice) => void;
  property: string;
  origin: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const sample = fillMessage(value.text, SAMPLE_VARS(property, origin));
  const info = smsInfo(sample);
  function add(v: string) {
    const el = ref.current;
    const at = el ? el.selectionStart : value.text.length;
    const text = `${value.text.slice(0, at)}{${v}}${value.text.slice(at)}`;
    if (text.length > 600) return;
    onChange({ ...value, text });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + v.length + 2, at + v.length + 2);
    });
  }
  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 font-medium">
          <Switch checked={value.on} onCheckedChange={(on) => onChange({ ...value, on })} />
          {label}
        </label>
        <label className="flex items-center gap-2 text-sm">
          {copy.at}
          <Input
            type="time"
            value={value.time}
            onChange={(e) => onChange({ ...value, time: e.target.value || value.time })}
            className="h-10 w-28"
          />
        </label>
      </div>
      <Textarea
        ref={ref}
        aria-label={`${label}: ${copy.words}`}
        value={value.text}
        maxLength={600}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        className="min-h-20"
      />
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{copy.placeholders}</span>
        {VARS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => add(v)}
            className="min-h-8 rounded-full border border-border px-2.5 hover:bg-muted"
          >
            {copy.vars[v]}
          </button>
        ))}
      </div>
      <div className="rounded-xl bg-muted p-3 text-sm">
        <p className="text-xs text-muted-foreground">{copy.sample}</p>
        <p className="mt-1 whitespace-pre-wrap break-words">{sample}</p>
        <p
          className={cn(
            "mt-2 text-xs",
            info.parts > 1 ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          {copy.length(info.chars, info.parts, info.unicode)}
          {info.parts > 1 ? ` ${copy.tooLong}` : ""}
        </p>
      </div>
    </div>
  );
}

/** Asking Latchkey support to connect the business's own WhatsApp number. */
function WhatsAppOwn({ hostId, isOwner }: { hostId: string; isOwner: boolean }) {
  const ask = useServerFn(requestWhatsApp);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isOwner) return <p className="text-xs text-muted-foreground">{copy.ownerOnly}</p>;
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageCircle className="size-4" aria-hidden /> {copy.waOwn}
      </Button>
    );
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void ask({ data: { hostId, number, note } })
          .then((r) => {
            if (!r.ok) {
              toast.error(copy.testFailed);
              return;
            }
            toast.success(copy.waAsked);
            setOpen(false);
            void qc.invalidateQueries({ queryKey: ["guest-texts"] });
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : common.errorBody))
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-sm text-muted-foreground">{copy.waOwnBody}</p>
      <Input
        type="tel"
        inputMode="tel"
        placeholder={copy.waNumber}
        aria-label={copy.waNumber}
        value={number}
        onChange={(e) => setNumber(e.target.value)}
      />
      <Input
        placeholder={copy.waNote}
        aria-label={copy.waNote}
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={busy || number.trim().length < 8}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {copy.waSend}
      </Button>
    </form>
  );
}

/**
 * Settings → Guests: this property's welcome and goodbye messages (rules in
 * src/lib/guest-messages.ts, sent with the calendar sync). The length shown
 * is with a guest's details and real-length links filled in.
 */
export function GuestMessagesSettings({
  propertyId,
  hostId,
  isOwner,
}: {
  propertyId: string;
  hostId: string;
  isOwner: boolean;
}) {
  const getFn = useServerFn(getGuestMessages);
  const saveFn = useServerFn(saveGuestMessages);
  const testFn = useServerFn(sendTestGuestMessage);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["guest-texts", propertyId],
    queryFn: () => getFn({ data: { propertyId } }),
  });
  const info = q.data?.available ? q.data : null;
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (info) setForm(info.settings);
  }, [info]);
  const dirty = !!info && !!form && (changed(form, info.settings) || !info.saved);

  if (q.data && !q.data.available)
    return (
      <div className="card-soft p-5">
        <h2 className="font-display text-xl">{copy.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{copy.needsUpdate}</p>
      </div>
    );
  if (!info || !form)
    return (
      <div className="card-soft grid place-items-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await saveFn({ data: { propertyId, settings: form } });
      await qc.invalidateQueries({ queryKey: ["guest-texts", propertyId] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  async function test(via: "sms" | "whatsapp" | "email") {
    if (!form) return;
    setTesting(true);
    try {
      const r = await testFn({
        data: { propertyId, kind: "welcome", text: form.welcome.text, to: testTo, via },
      });
      if (r.status === "sent") toast.success(copy.testSent);
      else if (r.status === "demo") toast.info(copy.testDemo);
      else toast.error(copy.testFailed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setTesting(false);
    }
  }

  const wa = info.whatsapp;
  const ch = info.channels;
  return (
    <div className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.intro}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy} onClick={() => void save()} />
      </div>
      {ch.demo ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{copy.demo}</p>
      ) : null}

      <MessageBox
        label={copy.welcome}
        value={form.welcome}
        onChange={(welcome) => setForm({ ...form, welcome })}
        property={info.property.name}
        origin={info.origin}
      />
      <MessageBox
        label={copy.goodbye}
        value={form.goodbye}
        onChange={(goodbye) => setForm({ ...form, goodbye })}
        property={info.property.name}
        origin={info.origin}
      />

      <div className="space-y-3 rounded-2xl border border-border p-3">
        <p className="font-medium">{copy.how}</p>
        <Select
          value={form.phone}
          onValueChange={(v) => setForm({ ...form, phone: v as PhoneRoute })}
        >
          <SelectTrigger className="h-11" aria-label={copy.how}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["auto", "sms", "whatsapp", "none"] as const).map((k) => (
              <SelectItem key={k} value={k}>
                {copy.phone[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={form.email}
            onCheckedChange={(v) => setForm({ ...form, email: v === true })}
            className="mt-0.5"
          />
          <span>
            {copy.email}
            <span className="block text-xs text-muted-foreground">{copy.emailNote}</span>
          </span>
        </label>
        {info.attachments.length ? (
          <div className="space-y-1">
            <Label>{copy.attach}</Label>
            <Select
              value={form.attachmentId ?? "none"}
              onValueChange={(v) => setForm({ ...form, attachmentId: v === "none" ? null : v })}
            >
              <SelectTrigger className="h-11" aria-label={copy.attach}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{copy.attachNone}</SelectItem>
                {info.attachments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{copy.attachHint}</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-2xl border border-border p-3">
        <p className="flex items-center gap-2 font-medium">
          <MessageCircle className="size-4" aria-hidden /> {copy.waTitle}
        </p>
        <p className="text-sm text-muted-foreground">
          {wa.status === "live" && wa.number
            ? copy.waLive(wa.number)
            : wa.status === "requested" && wa.number
              ? copy.waRequested(wa.number)
              : wa.shared
                ? copy.waShared(wa.shared)
                : copy.waNotSet}
        </p>
        {ch.whatsapp ? <p className="text-xs text-muted-foreground">{copy.waWording}</p> : null}
        {wa.status === "none" ? <WhatsAppOwn hostId={hostId} isOwner={isOwner} /> : null}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor={`test-${propertyId}`}>{copy.test}</Label>
          <Input
            id={`test-${propertyId}`}
            placeholder={copy.testTo}
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
        </div>
        {testTo.includes("@") ? (
          <Button variant="outline" disabled={testing} onClick={() => void test("email")}>
            <Send className="size-4" aria-hidden /> {copy.testEmail}
          </Button>
        ) : (
          <>
            {ch.sms ? (
              <Button
                variant="outline"
                disabled={testing || testTo.trim().length < 8}
                onClick={() => void test("sms")}
              >
                <Send className="size-4" aria-hidden /> {copy.testText}
              </Button>
            ) : null}
            {ch.whatsapp && ch.templates.welcome ? (
              <Button
                variant="outline"
                disabled={testing || testTo.trim().length < 8}
                onClick={() => void test("whatsapp")}
              >
                <MessageCircle className="size-4" aria-hidden /> {copy.testWhatsApp}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
