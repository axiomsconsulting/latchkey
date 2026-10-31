import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { useDoorTablets } from "@/components/host/DoorTablets";
import { LiveViewAll } from "@/components/host/TabletLive";
import { KioskWelcomePanel } from "@/components/host/KioskWelcomePanel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { common, kioskCardsCopy as copy } from "@/content/copy";
import { setKioskCard, todayKioskCards } from "@/lib/goodbye.functions";
import { tabletName } from "@/lib/kiosk-devices";
import type { KioskDevice } from "@/lib/kiosk-devices.functions";
import { pingKiosk } from "@/lib/kiosk-ping";
import { cn } from "@/lib/utils";

type Guest = { id: string; guest_full_name: string | null; status?: string };

/**
 * Today's guests for one kind of card (arriving or leaving), each with
 * whether their card is on the door tablet, and Show now / Take off. Used
 * on Today and in Settings → Kiosk.
 */
export function TodayCardList({
  property,
  kind,
}: {
  property: { id: string; short_code: string };
  kind: "in" | "out";
}) {
  const statesFn = useServerFn(todayKioskCards);
  const setFn = useServerFn(setKioskCard);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["kiosk-cards", property.id],
    queryFn: () => statesFn({ data: { propertyId: property.id } }),
    refetchInterval: 60_000,
  });
  const list = (q.data?.guests ?? []).filter((g: { kind: string }) => g.kind === kind);
  // With two or more tablets, Show now asks which ones (the card's own choice is kept).
  const devices = useDoorTablets(property.id, 60_000);
  const tablets = ((devices.data?.devices ?? []) as KioskDevice[]).filter(
    (d) => d.status === "confirmed",
  );
  const nameOf = (id: string) => {
    const d = tablets.find((t) => t.id === id);
    return d ? tabletName(d) : null;
  };

  async function change(id: string, show: boolean, on?: string[] | null) {
    try {
      const res = await setFn({
        data: { bookingId: id, kind, show, ...(on !== undefined ? { devices: on } : {}) },
      });
      await pingKiosk(res.code);
      await qc.invalidateQueries({ queryKey: ["kiosk-cards", property.id] });
      toast.success(show ? copy.shownNow : copy.takenOff);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  if (!list.length)
    return (
      <p className="text-sm text-muted-foreground">{kind === "in" ? copy.noneIn : copy.noneOut}</p>
    );
  return (
    <ul className="space-y-1.5">
      {list.map(
        (b: { id: string; name: string | null; state: string; devices: string[] | null }) => (
          <li key={b.id} className="flex items-center gap-2">
            <Link
              to="/app/bookings"
              search={{ guest: b.id }}
              className="min-w-0 flex-1 truncate text-sm hover:underline"
            >
              {b.name ?? copy.noName}
              <span className="block text-xs text-muted-foreground">
                {copy.state[b.state]}
                {b.devices?.length && tablets.length > 1 && b.state !== "done"
                  ? ` · ${copy.onTablets(b.devices.map(nameOf).filter(Boolean).join(", "))}`
                  : ""}
              </span>
            </Link>
            {b.state === "done" ? null : b.state === "showing" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs"
                onClick={() => void change(b.id, false)}
              >
                <EyeOff className="size-3.5" /> {copy.takeOff}
              </Button>
            ) : tablets.length > 1 ? (
              <TabletPick
                tablets={tablets.map((t) => ({ id: t.id, name: tabletName(t) }))}
                chosen={b.devices}
                onShow={(on) => void change(b.id, true, on)}
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs"
                onClick={() => void change(b.id, true)}
              >
                <Eye className="size-3.5" /> {copy.showNow}
              </Button>
            )}
          </li>
        ),
      )}
    </ul>
  );
}

/** Show now with two or more tablets: tick the ones the card goes to (every tablet to start with). */
function TabletPick({
  tablets,
  chosen,
  onShow,
}: {
  tablets: Array<{ id: string; name: string }>;
  chosen: string[] | null;
  onShow: (devices: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const all = ticked.size === tablets.length;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setTicked(new Set(chosen?.length ? chosen : tablets.map((t) => t.id)));
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 px-3 text-xs">
          <Eye className="size-3.5" /> {copy.showNow} <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2 text-sm">
        <p className="font-medium">{copy.whichTablets}</p>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={all}
            onCheckedChange={(v) => setTicked(new Set(v ? tablets.map((t) => t.id) : []))}
          />
          {copy.allTablets}
        </label>
        <div className="space-y-1.5 border-t border-border pt-2">
          {tablets.map((t) => (
            <label key={t.id} className="flex items-center gap-2">
              <Checkbox
                checked={ticked.has(t.id)}
                onCheckedChange={(v) =>
                  setTicked((s) => {
                    const n = new Set(s);
                    if (v) n.add(t.id);
                    else n.delete(t.id);
                    return n;
                  })
                }
              />
              {t.name}
            </label>
          ))}
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!ticked.size}
          onClick={() => {
            setOpen(false);
            onShow(all ? null : [...ticked]);
          }}
        >
          {copy.showOn(all ? tablets.length : ticked.size)}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Today: what the door tablet says to guests arriving and leaving today, in
 * one panel with a tab for each. Every guest has a card (on its own timing,
 * from Settings → Kiosk): show it now, or take it off. The check-in tab
 * also keeps the custom welcome the host writes for one arriving guest.
 */
export function KioskCardsPanel({
  property,
  arriving,
  leaving,
}: {
  property: { id: string; short_code: string };
  arriving: Guest[];
  leaving: Guest[];
}) {
  const [tab, setTab] = useState<"in" | "out">(arriving.length || !leaving.length ? "in" : "out");
  const [custom, setCustom] = useState(false);
  const tablets = useDoorTablets(property.id, 15_000);
  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label={copy.title}
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      >
        {(["in", "out"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "min-h-9 rounded-lg text-sm font-medium",
              tab === k ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {k === "in" ? copy.tabIn(arriving.length) : copy.tabOut(leaving.length)}
          </button>
        ))}
      </div>

      <TodayCardList property={property} kind={tab} />

      {tab === "in" ? (
        <div className="border-t border-border pt-2">
          <button
            type="button"
            aria-expanded={custom}
            onClick={() => setCustom((c) => !c)}
            className="flex min-h-10 w-full items-center justify-between text-sm font-medium"
          >
            {copy.custom}
            <ChevronDown className={cn("size-4 transition-transform", custom && "rotate-180")} />
          </button>
          {custom ? (
            <KioskWelcomePanel
              propertyId={property.id}
              shortCode={property.short_code}
              arriving={arriving}
              bare
            />
          ) : null}
        </div>
      ) : null}

      <LiveViewAll property={property} devices={tablets.data?.devices ?? []} />
      <Link
        to="/app/settings"
        search={{ focus: tab === "in" ? "welcomeCards" : "goodbye" }}
        className="inline-block text-xs text-primary hover:underline"
      >
        {tab === "in" ? copy.settingsIn : copy.settingsOut}
      </Link>
    </div>
  );
}
