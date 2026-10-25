import { useEffect, useState } from "react";
import { GuestDemoDock } from "@/components/DemoDock";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CalendarX, Check, Loader2, MapPin } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { ExpandableText } from "@/components/guest/ExpandableText";
import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { sectionIcon } from "@/components/guest/guide-icons";
import { GuideTiles, StayCover } from "@/components/guest/StayHero";
import { shownTiles } from "@/lib/guide-tiles";
import { guideCopy as gcopy, guest as copy, roomGuideCopy as rcopy } from "@/content/copy";
import { getRoomGuide } from "@/lib/guide.functions";
import { rememberedStay, rememberStay } from "@/lib/stay-link";
import { WifiCard } from "@/components/guest/WifiCard";
import { Button } from "@/components/ui/button";
import { stayProgressCopy as pcopy } from "@/content/copy";
import { readFix } from "@/lib/kiosk-presence";
import { openRoomStay, roomEntry } from "@/lib/stay-access.functions";
import { GuideSections } from "@/components/guest/GuideSections";
import { useScrollOpen } from "@/hooks/use-scroll-open";
import { rebrand } from "@/lib/brand";

/**
 * The guide behind the QR code in a room: how this room works, wifi, today's
 * closed times and the house rules. No login or app. A guest staying now is
 * offered their own stay (messages, extras); anyone else can check in.
 */
export const Route = createFileRoute("/room/$code")({
  // Straight to the guest's own stay when there is one for this phone (decided on the server, before anything loads).
  // ?preview=1: the host looking at the room guide itself (never sent on to a guest's stay).
  validateSearch: (s: Record<string, unknown>): { preview?: boolean } => (s["preview"] === "1" || s["preview"] === 1 || s["preview"] === true ? { preview: true } : {}),
  beforeLoad: async ({ params, search }) => {
    if (search.preview) return;
    const r = await roomEntry({ data: { code: params.code } }).catch(() => ({ to: "room" as const }));
    if (r.to === "stay") throw redirect({ to: "/stay/$token", params: { token: r.token }, replace: true });
  },
  loader: ({ params }) => getRoomGuide({ data: { code: params.code } }),
  head: () => ({
    meta: [
      { title: rebrand("Your room guide — Latchkey") },
      { name: "description", content: "How this room works: wifi, heating, shower, quiet hours and check-out." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.error} />
    </GuestFrame>
  ),
  component: RoomGuide,
});

function forgetIcon(key: string) {
  return key === "today" ? CalendarX : sectionIcon(key);
}

function RoomGuide() {
  const g = Route.useLoaderData();
  const { code } = Route.useParams();
  const { preview } = Route.useSearch();
  const [stay, setStay] = useState<string | null>(null);
  const [open, setOpen] = useState<string[]>(() => (g.found && g.guide[0] ? [g.guide[0].key] : []));
  // The section in the middle of the screen is open and highlighted, either way the guest scrolls.
  const { onOpenChange, active } = useScrollOpen(open, setOpen);
  // Opening the guest's own guide from here (when the host allows it): trying, offering the location check, or not here.
  const [own, setOwn] = useState<"idle" | "trying" | "locate" | "locating" | "notHere">("idle");
  const tryOpen = useServerFn(openRoomStay);
  useEffect(() => {
    if (!g.found) return;
    const known = rememberedStay(g.propertyId);
    // Remembered here from before the stay cookie existed: on to the stay (it leaves the cookie, so next time is direct).
    if (known && !preview) return void window.location.replace(`/stay/${known}`);
    setStay(known);
    // The server already tried this phone's connection; what's left is checking by location, if the host allows it.
    if (!known && g.early) setOwn("locate");
  }, [g, preview]);
  function go(token: string, checkOut: string) {
    if (g.found) rememberStay(g.propertyId, token, checkOut);
    window.location.href = `/stay/${token}`;
  }
  async function locate() {
    setOwn("locating");
    const fix = await readFix(true);
    if (!fix) return setOwn("notHere");
    const r = await tryOpen({ data: { code, fix } }).catch(() => null);
    if (r?.status === "open") return go(r.token, r.checkOut);
    setOwn("notHere");
  }

  if (!g.found) {
    return (
      <GuestFrame>
        <GuestMessage text={rcopy.gone} />
      </GuestFrame>
    );
  }

  return (
    <GuestFrame theme={g.theme} name={g.propertyName}>
      <GuestDemoDock code={g.demoCode} />
      <main className="mx-auto max-w-4xl space-y-6 py-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{rcopy.eyebrow}</p>
          <h1 className="mt-2 text-3xl sm:text-5xl">{g.room.title || g.room.name}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{rcopy.subtitle(g.propertyName)}</p>
        </header>

        {/* The same top as the stay guide: quick ways in, the cover (with "staying here?" until the room is checked in), and the Wi-Fi. */}
        <GuideTiles
          theme={g.theme}
          label={gcopy.quickTitle}
          tiles={shownTiles(g.tiles.tiles, { page: "room", sections: g.guide.map((sec) => ({ key: sec.key, title: sec.title })), hasWifi: !!g.wifi, canOrder: false }, { wifi: copy.stayNetwork, checkin: rcopy.checkIn })}
          stored={g.tiles.tiles}
          files={g.tiles.files}
          onAction={(a) => {
            if (a.kind === "checkin") {
              window.location.href = stay ? `/stay/${stay}` : `/kiosk/${g.shortCode}?guest=1`;
              return;
            }
            if (a.kind !== "jump") return;
            const key = a.section;
            if (key) setOpen((o) => (o.includes(key) ? o : [...o, key]));
            window.setTimeout(() => (document.getElementById(a.target) ?? (key ? document.getElementById("forget") : null))?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
          }}
        />
        <StayCover
          theme={g.theme}
          name={g.propertyName}
          photo={g.roomPhoto}
          extras={false}
          // This device's own stay: open it. Someone already checked in to this room today: no invite. Otherwise: check in.
          invite={
            stay
              ? { eyebrow: rcopy.stayEyebrow, title: rcopy.openStay, body: rcopy.yourStay, cta: rcopy.openStay, href: `/stay/${stay}`, icon: "key" }
              : g.occupied
                ? undefined
                : { eyebrow: rcopy.stayingHere, title: rcopy.checkInTitle, body: rcopy.checkInBody, cta: rcopy.checkIn, href: `/kiosk/${g.shortCode}?guest=1`, icon: "key" }
          }
        />
        {own !== "idle" ? (
          <section aria-live="polite" className="card-soft space-y-3 p-5">
            <h2 className="text-xl">{pcopy.roomTitle}</h2>
            {own === "trying" ? (
              <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {pcopy.roomBody}</p>
            ) : own === "notHere" ? (
              <p className="text-muted-foreground">{pcopy.roomNotHere}</p>
            ) : (
              <>
                <p className="text-muted-foreground">{pcopy.roomAway}</p>
                <Button type="button" onClick={() => void locate()} disabled={own === "locating"}>
                  {own === "locating" ? <Loader2 className="animate-spin" /> : <MapPin />} {own === "locating" ? pcopy.roomLocating : pcopy.roomLocate}
                </Button>
                <p className="text-xs text-muted-foreground">{pcopy.roomLocateHelp}</p>
              </>
            )}
          </section>
        ) : null}

        {g.forget.length ? (
          <section aria-labelledby="forget" className="rounded-3xl border-2 border-accent/40 bg-accent/10 p-5">
            <h2 id="forget" className="text-xl">{gcopy.forgetTitle}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {g.forget.map((f, i) => {
                const Icon = forgetIcon(f.key);
                return (
                  <li key={i} className="flex min-h-12 items-start gap-3 rounded-2xl bg-surface px-4 py-3 text-lg">
                    <Icon className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden />
                    <ExpandableText text={f.text} className="text-lg" />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {g.wifi ? <WifiCard id="room-wifi" wifi={g.wifi} profileUrl={`/api/public/wifi/room/${code}`} checkInHref={stay ? `/stay/${stay}` : `/kiosk/${g.shortCode}?guest=1`} /> : null}

        {g.amenities.length ? (
          <section aria-labelledby="amenities" className="card-soft p-5">
            <h2 id="amenities" className="text-xl">{gcopy.amenitiesTitle}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {g.amenities.map((a) => (
                <li key={a} className="flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-base">
                  <Check className="size-4 text-primary" aria-hidden />
                  {a}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <GuideSections sections={g.guide as never} open={open} onOpenChange={onOpenChange} active={active} />
        <p className="text-center text-sm text-muted-foreground">{rcopy.footer}</p>
      </main>
    </GuestFrame>
  );
}
