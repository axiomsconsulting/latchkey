import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Car, CalendarDays, Footprints, Info, MapPin, Navigation, Star } from "lucide-react";

import { AttachmentViewer } from "@/components/guest/GuideAttachments";
import type { ExtraCard } from "@/components/guest/GuideSections";
import { INFO_ICON } from "@/components/guest/info-icons";
import { RichText } from "@/components/RichText";
import { guideExtrasCopy as copy } from "@/content/copy";
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
  if (d.local && (d.local.places.length || d.local.events.length))
    out.push({
      key: "local",
      title: copy.localTitle,
      Icon: MapPin,
      lead: copy.localLead,
      body: <AroundHere places={d.local.places} events={d.local.events} />,
      after: true,
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
      {d.planUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-white">
          <img src={d.planUrl} alt={copy.planAlt(d.roomName)} className="block w-full" />
          <span
            aria-hidden
            className="absolute size-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-4 border-white bg-primary shadow-lg"
            style={{ left: `${d.at.x * 100}%`, top: `${d.at.y * 100}%` }}
          />
        </div>
      ) : null}
    </div>
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
