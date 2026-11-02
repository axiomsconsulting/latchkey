import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgePercent,
  Copy,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PhoneInput } from "@/components/WorldPickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { common, vouchersAdminCopy as copy } from "@/content/copy";
import { money } from "@/lib/direct-rates";
import {
  monthPeriod,
  normalisePeriods,
  periodsText,
  shareLinks,
  voucherMessage,
  voucherNight,
  voucherValueText,
  type VoucherKind,
  type VoucherPeriod,
} from "@/lib/vouchers";
import { cancelVoucher, createVoucher, listVouchers } from "@/lib/vouchers.functions";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof listVouchers>>;
type Row = Data["vouchers"][number];

/**
 * Direct stays → Loyalty vouchers: one-use codes for a named guest, chosen
 * rooms and dates, worth a percentage off or a set price per night (replacing
 * other discounts on those nights). The host sends each from their own
 * WhatsApp, texts or email, or copies the message.
 */
export function LoyaltyVouchers({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(listVouchers);
  const cancelFn = useServerFn(cancelVoucher);
  const key = ["vouchers", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => fn({ data: { propertyId } }) });
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<Row | null>(null);

  if (q.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const d = q.data;
  if (!d) return null;
  const roomName = (id: string) => d.rooms.find((r) => r.id === id)?.name ?? copy.oldRoom;
  const cash = (p: number) => money(p, d.property.currency);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">{copy.body}</p>
        <Button type="button" disabled={!d.available} onClick={() => setCreating(true)}>
          <Plus /> {copy.create}
        </Button>
      </div>
      {!d.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}
      {d.vouchers.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{copy.none}</p>
      ) : (
        <ul className="space-y-2">
          {d.vouchers.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3"
            >
              <BadgePercent className="size-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1 basis-56 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold tracking-wider">{v.code}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      v.status === "active"
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {copy.status[v.status]}
                    {v.status === "used" && v.reference ? ` · ${v.reference}` : ""}
                  </span>
                </p>
                <p>
                  {v.guestName} · {voucherValueText(v, cash)} · {v.roomIds.map(roomName).join(", ")}
                </p>
                <p className="text-muted-foreground">{periodsText(v.periods)}</p>
              </div>
              <div className="flex gap-1">
                {v.status === "active" ? (
                  <>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSharing(v)}>
                      {copy.send}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void cancelFn({ data: { id: v.id } })
                          .then(() => qc.invalidateQueries({ queryKey: key }))
                          .catch((e: unknown) =>
                            toast.error(e instanceof Error ? e.message : common.errorBody),
                          )
                      }
                    >
                      {copy.cancel}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <CreateVoucher
        open={creating}
        onOpenChange={setCreating}
        data={d}
        propertyId={propertyId}
        onCreated={async (id) => {
          const fresh = await qc.fetchQuery({
            queryKey: key,
            queryFn: () => fn({ data: { propertyId } }),
          });
          setCreating(false);
          setSharing(fresh.vouchers.find((v) => v.id === id) ?? null);
        }}
      />
      {sharing ? (
        <ShareVoucher v={sharing} data={d} onClose={() => setSharing(null)} roomName={roomName} />
      ) : null}
    </div>
  );
}

function CreateVoucher({
  open,
  onOpenChange,
  data,
  propertyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: Data;
  propertyId: string;
  onCreated: (id: string) => Promise<void>;
}) {
  const createFn = useServerFn(createVoucher);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<{ country: string; national: string; e164: string | null }>({
    country: "GB",
    national: "",
    e164: null,
  });
  const [knownPhone, setKnownPhone] = useState<string | null>(null);
  const [rooms, setRooms] = useState<string[]>([]);
  const [periods, setPeriods] = useState<VoucherPeriod[]>([]);
  const [month, setMonth] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<VoucherKind>("percent");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const cash = (p: number) => money(p, data.property.currency);

  const amount =
    kind === "percent"
      ? Math.round(Number(value))
      : Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
  const valid = amount > 0 && (kind === "price" || amount <= 100);
  const phoneE164 = knownPhone ?? phone.e164;

  const addPeriod = (p: VoucherPeriod) => setPeriods((x) => normalisePeriods([...x, p]));

  async function save() {
    if (name.trim().length < 2) return void toast.error(copy.needName);
    if (!rooms.length) return void toast.error(copy.needRooms);
    if (!periods.length) return void toast.error(copy.needDates);
    if (!valid) return void toast.error(copy.needValue);
    setBusy(true);
    try {
      const r = await createFn({
        data: {
          propertyId,
          guestName: name.trim(),
          guestEmail: email.trim() || null,
          guestPhone: phoneE164,
          roomIds: rooms,
          periods,
          kind,
          value: amount,
          note: note.trim() || null,
        },
      });
      await onCreated(r.id);
      setName("");
      setEmail("");
      setKnownPhone(null);
      setPhone({ country: "GB", national: "", e164: null });
      setRooms([]);
      setPeriods([]);
      setValue("");
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] max-w-xl grid-cols-[minmax(0,1fr)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.createTitle}</DialogTitle>
          <DialogDescription>{copy.createHelp}</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{copy.guest}</legend>
          {data.guests.length ? (
            <Select
              value=""
              onValueChange={(i) => {
                const g = data.guests[Number(i)];
                if (!g) return;
                setName(g.name);
                setEmail(g.email ?? "");
                setKnownPhone(g.phone && /^\+[1-9]\d{6,14}$/.test(g.phone) ? g.phone : null);
              }}
            >
              <SelectTrigger className="h-10" aria-label={copy.pickGuest}>
                <SelectValue placeholder={copy.pickGuest} />
              </SelectTrigger>
              <SelectContent>
                {data.guests.map((g, i) => (
                  <SelectItem key={`${g.name}-${i}`} value={String(i)}>
                    {g.name}
                    {g.email ? ` · ${g.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Input
            aria-label={copy.name}
            placeholder={copy.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            type="email"
            aria-label={copy.email}
            placeholder={copy.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {knownPhone ? (
            <p className="flex items-center gap-2 text-sm">
              {knownPhone}
              <button type="button" className="underline" onClick={() => setKnownPhone(null)}>
                {copy.changePhone}
              </button>
            </p>
          ) : (
            <PhoneInput
              country={phone.country}
              national={phone.national}
              onChange={(p) => setPhone({ country: p.country, national: p.national, e164: p.e164 })}
            />
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{copy.rooms}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.rooms.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 rounded-xl border border-border p-2 text-sm"
              >
                <Checkbox
                  checked={rooms.includes(r.id)}
                  onCheckedChange={(v) =>
                    setRooms((x) => (v === true ? [...x, r.id] : x.filter((y) => y !== r.id)))
                  }
                />
                {r.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{copy.when}</legend>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="v-month" className="text-xs">
                {copy.month}
              </Label>
              <Input
                id="v-month"
                type="month"
                className="h-10 w-44"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!/^\d{4}-\d{2}$/.test(month)}
              onClick={() => {
                addPeriod(monthPeriod(month));
                setMonth("");
              }}
            >
              {copy.addMonth}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="v-from" className="text-xs">
                {copy.from}
              </Label>
              <Input
                id="v-from"
                type="date"
                className="h-10 w-40"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="v-to" className="text-xs">
                {copy.to}
              </Label>
              <Input
                id="v-to"
                type="date"
                className="h-10 w-40"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!from}
              onClick={() => {
                addPeriod({ from, to: to || from });
                setFrom("");
                setTo("");
              }}
            >
              {copy.addDates}
            </Button>
          </div>
          {periods.length ? (
            <ul className="flex flex-wrap gap-2">
              {periods.map((p) => (
                <li
                  key={p.from}
                  className="flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm"
                >
                  {periodsText([p])}
                  <button
                    type="button"
                    aria-label={copy.removeDates}
                    className="grid size-6 place-items-center rounded-full hover:bg-secondary"
                    onClick={() => setPeriods((x) => x.filter((y) => y !== p))}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{copy.whenHelp}</p>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{copy.offer}</legend>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as VoucherKind)}>
              <SelectTrigger className="h-10 w-48" aria-label={copy.offer}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">{copy.percent}</SelectItem>
                <SelectItem value="price">{copy.price}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              inputMode="decimal"
              className="h-10 w-28 text-right"
              aria-label={kind === "percent" ? copy.percent : copy.price}
              placeholder={kind === "percent" ? "15" : "80.00"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">
              {kind === "percent" ? "%" : copy.perNight}
            </span>
          </div>
          {valid && rooms.length ? (
            <ul className="rounded-xl bg-muted p-3 text-sm">
              {rooms.map((id) => {
                const r = data.rooms.find((x) => x.id === id);
                if (!r) return null;
                return (
                  <li key={id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span className="tabular-nums">
                      {r.ratePence !== null ? (
                        <>
                          <span className="text-muted-foreground line-through">
                            {cash(r.ratePence)}
                          </span>{" "}
                          <span className="font-semibold">
                            {cash(voucherNight({ kind, value: amount }, r.ratePence))}
                          </span>
                        </>
                      ) : kind === "price" ? (
                        <span className="font-semibold">{cash(amount)}</span>
                      ) : (
                        copy.noRate
                      )}{" "}
                      {copy.aNight}
                    </span>
                  </li>
                );
              })}
              <li className="mt-1 text-xs text-muted-foreground">{copy.replaces}</li>
            </ul>
          ) : null}
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="v-note">{copy.note}</Label>
          <Textarea
            id="v-note"
            rows={2}
            maxLength={500}
            placeholder={copy.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <Button type="button" size="lg" disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="animate-spin" /> : <BadgePercent />} {copy.make}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ShareVoucher({
  v,
  data,
  onClose,
  roomName,
}: {
  v: Row;
  data: Data;
  onClose: () => void;
  roomName: (id: string) => string;
}) {
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/book/${data.property.shortCode}?voucher=${v.code}`;
  const initial = useMemo(
    () =>
      voucherMessage({
        firstName: v.guestName.split(/\s+/)[0] ?? v.guestName,
        property: data.property.name,
        code: v.code,
        value: voucherValueText(v, (p) => money(p, data.property.currency)),
        rooms: v.roomIds.map(roomName),
        periods: v.periods,
        link,
        note: v.note,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v.id],
  );
  const [msg, setMsg] = useState(initial);
  const links = shareLinks(msg, {
    phone: v.guestPhone,
    email: v.guestEmail,
    subject: copy.subject(data.property.name),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{copy.shareTitle(v.guestName)}</DialogTitle>
          <DialogDescription>{copy.shareHelp}</DialogDescription>
        </DialogHeader>
        <p className="text-center font-mono text-2xl font-semibold tracking-widest">{v.code}</p>
        <Textarea
          rows={6}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          aria-label={copy.message}
        />
        <div className="grid grid-cols-2 gap-2">
          {links.whatsapp ? (
            <Button asChild variant="outline">
              <a href={links.whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          ) : null}
          {links.sms ? (
            <Button asChild variant="outline">
              <a href={links.sms}>
                <MessageSquare /> {copy.text}
              </a>
            </Button>
          ) : null}
          {links.email ? (
            <Button asChild variant="outline">
              <a href={links.email}>
                <Mail /> {copy.emailIt}
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(msg).then(
                () => toast.success(copy.copied),
                () => toast.error(common.errorBody),
              )
            }
          >
            <Copy /> {copy.copy}
          </Button>
        </div>
        {!links.whatsapp && !links.email ? (
          <p className="text-xs text-muted-foreground">{copy.noContact}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
