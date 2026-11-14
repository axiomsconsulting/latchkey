import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";

import { FloorMapView } from "@/components/FloorMapView";
import { AREA_FILL } from "@/components/floor-map-look";
import { BrandBlock } from "@/components/theme/ThemeDecor";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { floorPrintCopy as copy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import {
  AREA_WORDS,
  ITEM_WORDS,
  floorTitle,
  isFurniture,
  nameOf,
  sortFloors,
  stairMarks,
} from "@/lib/floor-map";
import { mapFloors, type FloorPlan } from "@/lib/floor-plans";
import { getFloorPlans } from "@/lib/guest-extras.functions";
import { normaliseTheme } from "@/lib/theme";

/**
 * The property's floor plans, printed in its own look: one floor, the chosen floors, or all of
 * them, one to a page (?floors=<id>,<id>; none = all). Each page has the brand at the top, the
 * floor's name, its map with every area named, the key and what's in each space.
 */
export const Route = createFileRoute("/_authenticated/app/floor-plans-print/$propertyId")({
  validateSearch: (s: Record<string, unknown>): { floors?: string } =>
    typeof s["floors"] === "string" ? { floors: s["floors"] } : {},
  head: () => ({ meta: [{ title: rebrand("Print floor plans — Latchkey") }] }),
  component: PrintFloorPlans,
});

function PrintFloorPlans() {
  const { propertyId } = Route.useParams();
  const { floors } = Route.useSearch();
  const fn = useServerFn(getFloorPlans);
  const q = useQuery({
    queryKey: ["floor-plans", propertyId],
    queryFn: () => fn({ data: { propertyId } }),
  });
  const plans = useMemo(
    () =>
      sortFloors(
        (
          (q.data?.plans ?? []) as Array<FloorPlan & { url: string | null; label?: string | null }>
        ).map((p) => ({ ...p, building: p.pins.building ?? "" })),
      ),
    [q.data],
  );
  const [chosen, setChosen] = useState<string[] | null>(null);
  const picked =
    chosen ??
    (floors
      ? floors.split(",").filter((id) => plans.some((p) => p.id === id))
      : plans.map((p) => p.id));
  const theme = normaliseTheme(q.data?.property.theme ?? null);
  const name = q.data?.property.name ?? "";
  const roomNames = Object.fromEntries((q.data?.rooms ?? []).map((r) => [r.id, r.name]));
  const mapped = useMemo(() => mapFloors(plans as FloorPlan[]), [plans]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/guides">
            <ArrowLeft className="size-4" /> {copy.back}
          </Link>
        </Button>
        <Button onClick={() => window.print()} disabled={!picked.length}>
          <Printer className="size-4" /> {copy.print(picked.length)}
        </Button>
      </div>
      {q.isLoading ? <Skeleton className="h-96 w-full" /> : null}
      {plans.length ? (
        <section className="card-soft space-y-2 p-4 print:hidden">
          <p className="font-medium">{copy.which}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {plans.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
                <Checkbox
                  checked={picked.includes(p.id)}
                  onCheckedChange={(v) =>
                    setChosen(v ? [...picked, p.id] : picked.filter((x) => x !== p.id))
                  }
                />
                {p.label || floorTitle(p.building, p.level)}
              </label>
            ))}
          </div>
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              className="text-primary underline"
              onClick={() => setChosen(plans.map((p) => p.id))}
            >
              {copy.all}
            </button>
            <button type="button" className="text-primary underline" onClick={() => setChosen([])}>
              {copy.none}
            </button>
          </div>
        </section>
      ) : q.data ? (
        <p className="text-muted-foreground">{copy.empty}</p>
      ) : null}

      <ThemeScope theme={theme} full>
        <div className="space-y-6 print:space-y-0">
          {plans
            .filter((p) => picked.includes(p.id))
            .map((p) => {
              const f = mapped.find((m) => m.id === p.id);
              const areas = f?.map.areas ?? [];
              const items = f?.map.items ?? [];
              const title = p.label || floorTitle(p.building, p.level);
              const spaces = areas
                .filter((a) => a.access !== "private")
                .map((a) => ({
                  name: nameOf(a, roomNames),
                  things: items
                    .filter(
                      (it) =>
                        !isFurniture(it.kind) &&
                        areas.find((x) => x.id === a.id) &&
                        inPoly(it.at, a.poly),
                    )
                    .map((it) => ITEM_WORDS[it.kind]),
                }))
                .filter((s) => s.things.length);
              return (
                <div key={p.id} className="print-sheet-wrap">
                  <article
                    className="print-sheet mx-auto flex w-full flex-col gap-3 rounded-2xl border-2 border-primary bg-white p-6 text-neutral-900 shadow-sm"
                    style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
                  >
                    <header className="flex items-end justify-between gap-4 border-b-2 border-primary pb-3">
                      <BrandBlock theme={theme} name={name} size="md" />
                      <h1 className="font-display text-2xl text-primary">{title}</h1>
                    </header>
                    <div className="min-h-0 flex-1">
                      <FloorMapView
                        url={p.url}
                        alt={title}
                        areas={areas.map((a) => ({
                          poly: a.poly,
                          kind: a.kind,
                          access: a.access === "shared" ? "open" : a.access,
                          label:
                            a.access === "private" && !a.name
                              ? copy.private
                              : nameOf(a, roomNames) || AREA_WORDS[a.kind],
                        }))}
                        lines={f?.map.lines ?? []}
                        items={items}
                        marks={stairMarks(mapped, p.id)}
                        fitHeight="190mm"
                        className="rounded-xl"
                      />
                    </div>
                    <footer className="space-y-2 text-xs">
                      <p className="flex flex-wrap gap-x-4 gap-y-1">
                        <KeySwatch colour={AREA_FILL["open"]!}>{copy.key.shared}</KeySwatch>
                        <KeySwatch colour={AREA_FILL["guest_room"]!}>
                          {copy.key.guestRoom}
                        </KeySwatch>
                        <KeySwatch colour="rgba(185,28,28,0.45)">{copy.key.private}</KeySwatch>
                      </p>
                      {spaces.length ? (
                        <ul className="columns-2 gap-6">
                          {spaces.map((s, i) => (
                            <li key={i} className="break-inside-avoid">
                              <span className="font-semibold">{s.name}</span>: {s.things.join(", ")}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </footer>
                  </article>
                </div>
              );
            })}
        </div>
      </ThemeScope>
    </div>
  );
}

function KeySwatch({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-5 rounded-sm border border-neutral-400"
        style={{ background: colour }}
      />
      {children}
    </span>
  );
}

/** Point in polygon (ray casting). */
function inPoly(p: { x: number; y: number }, poly: Array<{ x: number; y: number }>): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}
