import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Car,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Footprints,
  House,
  Info,
  MapPin,
  Navigation,
  Star,
  X,
} from "lucide-react";

import { FloorMapView } from "@/components/FloorMapView";
import { AttachmentViewer } from "@/components/guest/GuideAttachments";
import type { ExtraCard } from "@/components/guest/GuideSections";
import { INFO_ICON } from "@/components/guest/info-icons";
import { RichText } from "@/components/RichText";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { guest as gcopy, guideExtrasCopy as copy } from "@/content/copy";
import { swipeStep, wrapIndex } from "@/lib/guide-view";
import { levelName } from "@/lib/floor-map";
import { getRoomExtras, getStayExtras } from "@/lib/guest-extras.functions";
import {
  PLACE_CATEGORIES,
  directionsLink,
  distanceText,
  driveMinutes,
  walkMinutes,
  type LocalEvent,
  type Place,
  type PlaceCategory,
} from "@/lib/local-guide";
import { cn } from "@/lib/utils";

type Extras = NonNullable<Awaited<ReturnType<typeof getStayExtras>>>;

/**
 * The guide's extra cards for a stay (property information, the way to the room, around here)
 * or a room guide (no way to the room: they're in it). Loaded after the page, so the guide never
 * waits for them.
 */
export function useGuideExtraCards(from: { token: string } | { code: string }): ExtraCard[] {
  const stayFn = useServerFn(getStayExtras);
  const roomFn = useServerFn(getRoomExtras);
  const q = useQuery({
    queryKey: ["guide-extras", "token" in from ? from.token : from.code],
    queryFn: () =>
      "token" in from
        ? stayFn({ data: { token: from.token } })
        : roomFn({ data: { code: from.code } }),
    staleTime: 10 * 60_000,
  });
  return useMemo(() => (q.data ? cardsFor(q.data) : []), [q.data]);
}

function cardsFor(d: Extras): ExtraCard[] {
  const out: ExtraCard[] = [];
  if (d.directions)
    out.push({
      key: "find_room",
      title: copy.findTitle,
      Icon: Navigation,
      image: d.directions.planUrl,
      lead: d.directions.steps[d.directions.steps.length - 1] ?? null,
      body: <FindRoom d={d.directions} />,
    });
  if (d.info.length)
    out.push({
      key: "property_info",
      title: copy.infoTitle,
      Icon: Info,
      image: d.info.find((i) => i.imageUrls.length)?.imageUrls[0] ?? null,
      lead: copy.infoLead(d.info.length),
      body: <PropertyInfo items={d.info} />,
    });
  // Around the house and Around here are sections of their own, after the guide's cards.
  if (d.house || d.plans.length)
    out.push({
      key: "house",
      title: copy.houseTitle,
      Icon: House,
      lead: copy.houseLead,
      body: <AroundTheHouse n={d.house} plans={d.plans} />,
      own: true,
    });
  if (d.local && (d.local.places.length || d.local.events.length))
    out.push({
      key: "local",
      title: copy.localTitle,
      Icon: MapPin,
      lead: copy.localLead,
      body: <AroundHere places={d.local.places} events={d.local.events} />,
      own: true,
    });
  return out;
}

/* ------------------------------ finding your room ------------------------------ */

function FindRoom({ d }: { d: NonNullable<Extras["directions"]> }) {
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {d.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      {d.floors.map((f) => (
        <figure key={f.id} className="space-y-1">
          {d.floors.length > 1 ? (
            <figcaption className="text-sm font-medium">
              {copy.floorName(levelName(f.level))}
            </figcaption>
          ) : null}
          <FloorMapView
            url={f.url}
            alt={f.at ? copy.planAlt(d.roomName) : copy.floorAlt(levelName(f.level))}
            areas={f.areas}
            lines={f.lines}
            items={f.items}
            route={f.route}
            at={f.at}
          />
        </figure>
      ))}
      {d.floors.some((f) => f.areas.length) ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Key colour="#16a34a" dashed>
            {copy.key.route}
          </Key>
          <Key colour="rgba(22,163,74,0.45)">{copy.key.yours}</Key>
          <Key colour="rgba(220,38,38,0.35)">{copy.key.private}</Key>
          <Key colour="rgba(37,99,235,0.25)">{copy.key.shared}</Key>
        </p>
      ) : null}
      {d.heating.length ? (
        <div className="space-y-1">
          <p className="font-medium">{copy.heating}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {d.heating.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Key({
  colour,
  dashed,
  children,
}: {
  colour: string;
  dashed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-3 w-5 rounded-sm"
        style={dashed ? { borderTop: `3px dashed ${colour}`, height: 0 } : { background: colour }}
      />
      {children}
    </span>
  );
}

const planName = (f: Extras["plans"][number]) =>
  [f.building || null, levelName(f.level)].filter(Boolean).join(", ");

/**
 * Around the house: the plans (areas the guest can reach named and lit, everything else shaded),
 * opened large like any other picture; the spaces they can use with what's in them; one line
 * for the rest being private; and where useful things are.
 */
function AroundTheHouse({ n, plans }: { n: Extras["house"]; plans: Extras["plans"] }) {
  const [open, setOpen] = useState<number | null>(null);
  const privateCount = (n?.private.length ?? 0) + (n?.barriers.length ?? 0);
  return (
    <div className="space-y-4 text-sm">
      {plans.length ? (
        <div className="space-y-2">
          <p className="font-medium">{plans.length > 1 ? copy.plansMany : copy.plans}</p>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {plans.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setOpen(i)}
                aria-label={copy.openPlan(planName(f))}
                className={cn(
                  "shrink-0 space-y-1 text-left",
                  plans.length > 1 ? "w-[min(18rem,75%)]" : "w-full max-w-xl",
                )}
              >
                <FloorMapView
                  url={f.url}
                  alt={copy.floorAlt(planName(f))}
                  areas={f.areas}
                  lines={f.lines}
                  items={f.items}
                />
                {plans.length > 1 ? (
                  <span className="block text-xs font-medium">{copy.floorName(planName(f))}</span>
                ) : null}
              </button>
            ))}
          </div>
          <PlanKey />
        </div>
      ) : null}
      {n?.shared.length ? (
        <div>
          <p className="font-medium">{copy.shared}</p>
          <ul className="mt-1 space-y-1">
            {n.shared.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.name}</span>{" "}
                <span className="text-muted-foreground">({levelName(s.level)})</span>
                {s.items.length ? `: ${s.items.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {privateCount ? (
        <p className="text-muted-foreground">{copy.privateSummary(plans.length || 1)}</p>
      ) : null}
      {n?.useful.length ? (
        <div>
          <p className="font-medium">{copy.useful}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {n.useful.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <PlanViewer plans={plans} index={open} onIndex={setOpen} />
    </div>
  );
}

function PlanKey() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <Key colour="rgba(22,163,74,0.45)">{copy.key.yours}</Key>
      <Key colour="rgba(37,99,235,0.25)">{copy.key.shared}</Key>
      <Key colour="rgba(100,116,139,0.25)">{copy.key.guestRoom}</Key>
      <Key colour="rgba(220,38,38,0.35)">{copy.key.private}</Key>
    </p>
  );
}

/** A plan opened large, with the others a swipe or an arrow away. */
function PlanViewer({
  plans,
  index,
  onIndex,
}: {
  plans: Extras["plans"];
  index: number | null;
  onIndex: (i: number | null) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const f = index === null ? null : plans[index];
  const many = plans.length > 1;
  const go = (step: number) => onIndex(wrapIndex((index ?? 0) + step, plans.length));
  return (
    <Dialog open={!!f} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-3 p-3 sm:p-4 [&>button]:hidden">
        {f ? (
          <>
            <div className="flex items-center gap-2">
              <DialogTitle className="min-w-0 flex-1 truncate text-base font-medium">
                {copy.floorName(planName(f))}
              </DialogTitle>
              {many ? (
                <>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full hover:bg-muted"
                    aria-label={gcopy.attachmentPrev}
                    onClick={() => go(-1)}
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {(index ?? 0) + 1}/{plans.length}
                  </span>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full hover:bg-muted"
                    aria-label={gcopy.attachmentNext}
                    onClick={() => go(1)}
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full hover:bg-muted"
                aria-label={gcopy.attachmentClose}
                onClick={() => onIndex(null)}
              >
                <X className="size-5" />
              </button>
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto"
              onTouchStart={(e) => {
                const t = e.touches[0];
                start.current = t ? { x: t.clientX, y: t.clientY } : null;
              }}
              onTouchEnd={(e) => {
                const t = e.changedTouches[0];
                const s = start.current;
                start.current = null;
                if (!many || !t || !s) return;
                const step = swipeStep(t.clientX - s.x, t.clientY - s.y);
                if (step) go(step);
              }}
            >
              <FloorMapView
                key={f.id}
                url={f.url}
                alt={copy.floorAlt(planName(f))}
                areas={f.areas}
                lines={f.lines}
                items={f.items}
                className="mx-auto"
              />
            </div>
            <PlanKey />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ property information ------------------------------ */

function PropertyInfo({ items }: { items: Extras["info"] }) {
  const [at, setAt] = useState<string | null>(items[0]?.id ?? null);
  const [photo, setPhoto] = useState<number | null>(null);
  const item = items.find((i) => i.id === at) ?? null;
  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label={copy.infoTitle}
        className="grid grid-cols-4 gap-2 sm:grid-cols-6"
      >
        {items.map((i) => {
          const Icon = INFO_ICON[i.icon];
          const on = i.id === at;
          return (
            <button
              key={i.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setAt(on ? null : i.id)}
              className={cn(
                "flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center text-xs transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-secondary",
              )}
            >
              <Icon className="size-6" aria-hidden />
              <span className="line-clamp-2 leading-tight">{i.title}</span>
            </button>
          );
        })}
      </div>
      {item ? (
        <div role="tabpanel" className="space-y-3 rounded-2xl bg-secondary/50 p-4">
          <p className="font-display text-lg">{item.title}</p>
          {item.fields.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {item.fields.map((f, n) => (
                <div key={n} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {item.notes ? <RichText text={item.notes} className="text-base" /> : null}
          {item.imageUrls.length ? (
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {item.imageUrls.map((u, n) => (
                <button key={u} type="button" onClick={() => setPhoto(n)} className="shrink-0">
                  <img
                    src={u}
                    alt=""
                    loading="lazy"
                    className="h-28 w-40 rounded-xl object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
          <AttachmentViewer
            items={item.imageUrls.map((url, n) => ({
              id: `${item.id}-${n}`,
              name: item.title,
              kind: "image" as const,
              url,
            }))}
            index={photo}
            onIndex={setPhoto}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.infoPick}</p>
      )}
    </div>
  );
}

/* ------------------------------ around here ------------------------------ */

const isApple = () =>
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) &&
  "ontouchend" in document;

function AroundHere({ places, events }: { places: Place[]; events: LocalEvent[] }) {
  const kinds = PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c));
  const [kind, setKind] = useState<PlaceCategory | "all">("all");
  const shown = places.filter((p) => kind === "all" || p.category === kind).slice(0, 30);
  const apple = isApple();
  return (
    <div className="space-y-4">
      {events.length ? (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 font-medium">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            {copy.whatsOn}
          </h4>
          <ul className="space-y-1.5">
            {events.slice(0, 8).map((e) => (
              <li key={e.id} className="rounded-xl border border-border p-2.5 text-sm">
                <span className="font-medium">{e.name}</span>
                <span className="block text-muted-foreground">
                  {new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                  {e.time ? ` · ${e.time}` : ""}
                  {e.venue ? ` · ${e.venue}` : ""}
                </span>
                {e.url ? (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    {copy.website}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {places.length ? (
        <>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist">
            {(["all", ...kinds] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "h-10 shrink-0 rounded-full border px-3 text-sm",
                  kind === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card",
                )}
              >
                {k === "all" ? copy.all : copy.categories[k]}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {shown.map((p) => {
              const located = Number.isFinite(p.lat) && Number.isFinite(p.lng);
              return (
                <li key={p.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {p.name}
                        {p.pick ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 align-middle text-xs text-primary">
                            <Star className="size-3" aria-hidden />
                            {copy.hostPick}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          copy.categories[p.category],
                          p.metres >= 0 ? distanceText(p.metres) : null,
                          p.address,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {p.note ? <p className="mt-1 text-sm">{p.note}</p> : null}
                    </div>
                    {p.website ? (
                      <a
                        href={p.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary underline"
                      >
                        {copy.website}
                      </a>
                    ) : null}
                  </div>
                  {located ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        href={directionsLink(p, "walking", apple ? "apple" : "google")}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm"
                      >
                        <Footprints className="size-4" aria-hidden />
                        {p.metres >= 0 ? copy.walk(walkMinutes(p.metres)) : copy.walkPlain}
                      </a>
                      <a
                        href={directionsLink(p, "driving", apple ? "apple" : "google")}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm"
                      >
                        <Car className="size-4" aria-hidden />
                        {p.metres >= 0 ? copy.drive(driveMinutes(p.metres)) : copy.drivePlain}
                      </a>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            {copy.approx} {copy.osm}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.noPlaces}</p>
      )}
    </div>
  );
}
