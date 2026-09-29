import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bath, Bed, Bike, Car, Clock, Coffee, Droplets, Fan, Flame, Loader2, Luggage, Plug, Sparkles, Utensils, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { services as hostCopy, stayServices as copy } from "@/content/copy";
import { SERVICE_CATEGORIES, formatPence, type ServiceCategory } from "@/lib/services";
import { createStayRequest, getStayServices } from "@/lib/stay.functions";

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, bed: Bed, bath: Bath, droplets: Droplets, flame: Flame, fan: Fan, utensils: Utensils,
  plug: Plug, zap: Zap, coffee: Coffee, bike: Bike, car: Car, luggage: Luggage, clock: Clock, wrench: Wrench,
};

function Tile({ cat, onPick }: { cat: ServiceCategory; onPick: () => void }) {
  const Icon = ICONS[cat.icon] ?? Wrench;
  return (
    <button
      type="button"
      onClick={onPick}
      className="spring card-soft flex min-h-24 flex-col items-start justify-between gap-2 p-4 text-left active:scale-95"
    >
      <Icon className="size-6 text-primary" />
      <span className="font-medium leading-tight">{cat.label}</span>
      {cat.guestPricePence ? <span className="text-sm text-muted-foreground">{formatPence(cat.guestPricePence)}</span> : null}
    </button>
  );
}

export function StayServices({ token }: { token: string }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getStayServices);
  const create = useServerFn(createStayRequest);
  const q = useQuery({ queryKey: ["stay-services", token], queryFn: () => fetchFn({ data: { token } }), refetchInterval: 20_000 });
  const [picked, setPicked] = useState<ServiceCategory | null>(null);
  const [note, setNote] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);

  const tz = q.data?.timezone ?? "Europe/London";
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  async function send() {
    if (!picked) return;
    setBusy(true);
    try {
      await create({ data: { token, category: picked.id, note: note.trim() || null, urgent, wantedAt: null } });
      toast.success(copy.sent);
      setPicked(null);
      setNote("");
      setUrgent(false);
      await qc.invalidateQueries({ queryKey: ["stay-services", token] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const issues = SERVICE_CATEGORIES.filter((c) => c.kind === "issue");
  const extras = SERVICE_CATEGORIES.filter((c) => c.kind === "extra");

  return (
    <section className="space-y-5 pt-4">
      <div>
        <h2 className="text-2xl sm:text-3xl">{copy.title}</h2>
        <p className="text-muted-foreground">{copy.subtitle}</p>
      </div>

      {q.data && q.data.jobs.length > 0 ? (
        <div className="card-soft divide-y divide-border">
          <h3 className="p-4 text-lg">{copy.yourRequests}</h3>
          {q.data.jobs.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center gap-2 p-4">
              <span className="flex-1 font-medium">{j.title}</span>
              {j.etaAt && j.status === "booked" ? <span className="text-sm text-primary">{copy.expected(fmt(j.etaAt))}</span> : null}
              <span className="rounded-full bg-secondary px-3 py-1 text-sm">{hostCopy.statuses[j.status] ?? j.status}</span>
            </div>
          ))}
        </div>
      ) : null}

      {q.data && q.data.messages.length > 0 ? (
        <div className="card-soft p-4">
          <h3 className="text-lg">{copy.updates}</h3>
          <ul className="mt-2 space-y-2">
            {q.data.messages.slice(0, 6).map((m) => (
              <li key={m.id} className="rounded-2xl bg-secondary p-3">
                <p>{m.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{fmt(m.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-lg">{copy.issues}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {issues.map((c) => <Tile key={c.id} cat={c} onPick={() => { setPicked(c); setUrgent(c.defaultUrgency === "urgent"); }} />)}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-lg">{copy.extras}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {extras.map((c) => <Tile key={c.id} cat={c} onPick={() => { setPicked(c); setUrgent(false); }} />)}
        </div>
      </div>

      <Sheet open={picked !== null} onOpenChange={(o) => !o && setPicked(null)}>
        <SheetContent side="bottom" className="mx-auto max-w-xl rounded-t-[2rem] p-6">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">{picked?.label}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <p className="text-muted-foreground">
              {picked?.guestPricePence ? copy.price(formatPence(picked.guestPricePence)) : picked?.kind === "extra" ? copy.priceOnRequest : null}
            </p>
            <Textarea
              aria-label={copy.notePlaceholder}
              placeholder={copy.notePlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-24 text-lg"
            />
            {picked?.kind === "issue" ? (
              <label className="flex min-h-12 items-center justify-between rounded-2xl bg-secondary px-4">
                <span className="font-medium">{copy.urgent}</span>
                <Switch checked={urgent} onCheckedChange={setUrgent} />
              </label>
            ) : null}
            <Button size="touch-xl" className="w-full" onClick={send} disabled={busy}>
              {busy ? <Loader2 className="size-6 animate-spin" /> : null}
              {copy.send}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
