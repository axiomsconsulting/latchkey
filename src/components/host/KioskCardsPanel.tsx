import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { KioskWelcomePanel } from "@/components/host/KioskWelcomePanel";
import { Button } from "@/components/ui/button";
import { common, kioskCardsCopy as copy } from "@/content/copy";
import { setKioskCard, todayKioskCards } from "@/lib/goodbye.functions";
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

  async function change(id: string, show: boolean) {
    try {
      const res = await setFn({ data: { bookingId: id, kind, show } });
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
      {list.map((b: { id: string; name: string | null; state: string }) => (
        <li key={b.id} className="flex items-center gap-2">
          <Link
            to="/app/bookings"
            search={{ guest: b.id }}
            className="min-w-0 flex-1 truncate text-sm hover:underline"
          >
            {b.name ?? copy.noName}
            <span className="block text-xs text-muted-foreground">{copy.state[b.state]}</span>
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
      ))}
    </ul>
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
