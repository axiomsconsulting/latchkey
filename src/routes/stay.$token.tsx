import { useEffect, useState } from "react";
import { GuestDemoDock } from "@/components/DemoDock";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { rememberStay } from "@/lib/stay-link";
import { CalendarX, Check, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, KeyRound, Loader2, MessageCircle, Moon, Sun } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { GuideSections } from "@/components/guest/GuideSections";
import { getStayWeather } from "@/lib/weather.functions";
import { describeWeather, type WeatherIcon } from "@/lib/weather";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { ExpandableText } from "@/components/guest/ExpandableText";
import { StayExtras } from "@/components/guest/StayExtras";
import { StayInbox, openStayInbox } from "@/components/guest/StayInbox";
import { GuideTiles, StayCover, StaySummary } from "@/components/guest/StayHero";
import { shownTiles } from "@/lib/guide-tiles";
import { cn } from "@/lib/utils";
import { StayInvoice } from "@/components/guest/StayInvoice";
import { StayReview } from "@/components/guest/StayReview";
import { StayAgain } from "@/components/guest/StayAgain";
import { StayServices } from "@/components/guest/StayServices";

import { sectionIcon } from "@/components/guest/guide-icons";
import { guideCopy as gcopy, guest as copy, stayHeroCopy } from "@/content/copy";
import { getStay, startCheckInFromStay } from "@/lib/checkin.functions";
import { rebrand } from "@/lib/brand";
import { ThemeIcon } from "@/components/theme/ThemeDecor";
import { WifiCard } from "@/components/guest/WifiCard";
import { ReviewNudge } from "@/components/guest/ReviewNudge";
import { reviewDay } from "@/lib/stay-access";
import { Button } from "@/components/ui/button";
import { stayProgressCopy as pcopy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { useScrollOpen } from "@/hooks/use-scroll-open";

export const Route = createFileRoute("/stay/$token")({
  loader: ({ params }) => getStay({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: rebrand("Your guest guide — Latchkey") },
      { name: "description", content: "Your private step-by-step guide for your stay." },
      { property: "og:title", content: rebrand("Your guest guide — Latchkey") },
      { property: "og:description", content: "Your private step-by-step guide for your stay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.error} />
    </GuestFrame>
  ),
  component: Stay,
});

/** Reminder rows reuse the section's own icon; "today" is a one-off closure. */
function forgetIcon(key: string) {
  return key === "today" ? CalendarX : sectionIcon(key);
}

function Stay() {
  const s = Route.useLoaderData();
  const { token } = Route.useParams();
  useEffect(() => {
    if (s.found) rememberStay(s.propertyId, token, s.checkOutDate);
  }, [s, token]);
  if (!s.found) {
    const opens = "opensAt" in s && s.opensAt
      ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(new Date(s.opensAt))
      : null;
    return (
      <GuestFrame>
        <GuestMessage text={opens ? gcopy.notYet(opens) : copy.stayGone} />
      </GuestFrame>
    );
  }
  return <StayPage s={s} token={token} theme={s.theme} />;
}

type StayData = Extract<Awaited<ReturnType<typeof getStay>>, { found: true }>;

/** Jumps to a part of the guide (a section on the reminder card is found there). */
function jumpTo(id: string) {
  window.setTimeout(() => (document.getElementById(id) ?? (id.startsWith("guide-") ? document.getElementById("forget") : null))?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

function StayPage({ s, token, theme }: { s: StayData; token: string; theme: StayData["theme"] }) {
  const p = s.property;
  const [open, setOpen] = useState<string[]>([s.guide[0]?.key ?? ""]);
  // The section in the middle of the screen is open and highlighted, either way the guest scrolls.
  const { onOpenChange, active } = useScrollOpen(open, setOpen);
  // Quick ways in, in the theme's icon style: the host's chosen tiles, or Wi-Fi, the first guide sections, extras and messages.
  const tiles = shownTiles(
    s.tiles.tiles,
    { page: "stay", sections: [...s.guide, ...s.pinnedSections].map((g) => ({ key: g.key, title: g.title })), hasWifi: !!s.wifi, canOrder: !s.readOnly },
    { wifi: copy.stayNetwork, extras: gcopy.quickExtras, messages: stayHeroCopy.messageTile, times: stayHeroCopy.tileTimes },
  );
  return (
    <GuestFrame theme={s.theme} name={p?.name ?? undefined}>
      <GuestDemoDock code={s.demoCode} />
      <main className={cn("mx-auto max-w-4xl space-y-6 py-6 sm:py-8", s.needsCheckIn && !s.readOnly && "pb-32")}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {theme.eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-accent">{theme.eyebrow}</p> : null}
            <h1 className="text-3xl sm:text-5xl">{copy.stayTitle(s.firstName)}</h1>
            {/* Today, where they are: the date and the weather. */}
            <StayToday token={token} timeZone={p?.timezone ?? "Europe/London"} />
          </div>
          <StayInbox token={token} />
        </div>

        {/* Their stay (which night it is) and their room, straight under the welcome. */}
        <div id="stay-times" className="scroll-mt-6">
          <StaySummary
            theme={theme}
            checkInDate={s.checkInDate}
            checkInTime={s.checkInTime}
            checkOutDate={s.checkOutDate}
            checkOutTime={s.checkOutTime}
            wifi={null}
            room={s.room ? { name: s.room.display_name, title: s.room.public_title } : null}
            progress={s.progress}
          />
        </div>

        {/* The last day: a gentle ask for a review, where they booked (or here, for a direct stay). */}
        {s.review && reviewDay(s.progress.phase) ? <ReviewNudge token={token} ask={s.review} place={p?.name ?? ""} /> : null}

        <GuideTiles
          theme={theme}
          label={gcopy.quickTitle}
          tiles={tiles}
          stored={s.tiles.tiles}
          files={s.tiles.files}
          onAction={(a) => {
            if (a.kind === "messages") return openStayInbox();
            if (a.kind === "extras") return jumpTo("stay-extras");
            if (a.kind === "jump") {
              if (a.section) setOpen((o) => (o.includes(a.section!) ? o : [...o, a.section!]));
              jumpTo(a.target);
            }
          }}
        />

        {/* The cover photo with the extras invitation, the stay at a glance, and help: in every template's own look. */}
        <StayCover theme={theme} name={p?.name ?? ""} photo={s.roomPhoto} extras={!s.readOnly} onExtras={() => jumpTo("stay-extras")} />
        <section aria-labelledby="forget" className="rounded-3xl border-2 border-accent/40 bg-accent/10 p-5">
          <h2 id="forget" className="text-xl">{gcopy.forgetTitle}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {s.forget.map((f, i) => {
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

        {s.amenities.length ? (
          <section aria-labelledby="amenities" className="card-soft p-5">
            <h2 id="amenities" className="text-xl">{gcopy.amenitiesTitle}</h2>
            <p className="mt-1 text-muted-foreground">{gcopy.amenitiesBody}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {s.amenities.map((a) => (
                <li key={a} className="flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-base">
                  <Check className="size-4 text-primary" aria-hidden />
                  {a}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {s.wifi ? <WifiCard id="stay-wifi" wifi={s.wifi} profileUrl={`/api/public/wifi/stay/${token}`} checkInHref={`/kiosk/${p?.short_code ?? ""}?guest=1`} /> : null}

        <GuideSections
          sections={s.guide as never}
          open={open}
          onOpenChange={onOpenChange}
          active={active}
          lockedText={gcopy.doorLocked(new Intl.DateTimeFormat("en-GB", { timeZone: p?.timezone ?? "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s.doorOpensAt)))}
        />

        {s.readOnly ? <p className="card-soft p-5 text-lg">{gcopy.readOnly}</p> : (<><div id="stay-extras" className="scroll-mt-6"><StayExtras token={token} /></div><StayServices token={token} /></>)}
        <StayInvoice token={token} place={p?.name ?? ""} />
        {/* The second of the guide's two ways to message (the first is at the top): anything not covered here, before the feedback. */}
        {s.readOnly ? null : <NeedSomethingElse text={s.stayMessage} />}
        {/* A direct guest asked on the last day reviews there; otherwise the private note to the host stays here. */}
        {s.review?.direct && reviewDay(s.progress.phase) ? null : <StayReview token={token} />}
        {s.readOnly ? null : <StayAgain token={token} />}
      </main>
      {s.needsCheckIn && !s.readOnly ? <CheckInNudge token={token} firstName={s.firstName} /> : null}
    </GuestFrame>
  );
}

/** "Need something else?": a question that isn't answered in the guide, straight to the host. */
function NeedSomethingElse({ text }: { text: string }) {
  return (
    <section aria-labelledby="need-else" className="card-soft flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <h2 id="need-else" className="text-xl">{pcopy.needElse}</h2>
        <p className="text-muted-foreground">{text}</p>
      </div>
      <Button onClick={openStayInbox} className="shrink-0">
        <MessageCircle /> {pcopy.messageUs}
      </Button>
    </section>
  );
}

/**
 * Until their check-in (and in the UK the guest register) is done, even when
 * the host has marked the stay as checked in: a banner by name along the
 * bottom of the screen, always there until it's done. "Finish now" opens
 * check-in on their phone already at "Is this you?".
 */
function CheckInNudge({ token, firstName }: { token: string; firstName: string | null }) {
  const start = useServerFn(startCheckInFromStay);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Back from check-in without finishing (the browser restores this page as it was): stop spinning and look again.
  useEffect(() => {
    const back = () => {
      setBusy(false);
      void router.invalidate();
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) back();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  // Never spin for ever: if check-in hasn't opened after a while, the button works again.
  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => setBusy(false), 20_000);
    return () => window.clearTimeout(t);
  }, [busy]);
  async function go() {
    setBusy(true);
    try {
      const r = await start({ data: { token } });
      window.location.href = `/kiosk/${r.code}?guest=1&resume=${encodeURIComponent(r.session)}`;
    } catch {
      setBusy(false);
      toast.error(pcopy.nudgeFailed);
    }
  }
  return (
    <div
      role="region"
      aria-label={pcopy.nudgeTitle(firstName)}
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-primary/30 bg-surface p-3 shadow-lg"
    >
      <KeyRound className="size-6 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{pcopy.nudgeTitle(firstName)}</span>
        <span className="block text-sm text-muted-foreground">{pcopy.nudgeBody}</span>
      </span>
      <Button onClick={() => void go()} disabled={busy} className="shrink-0">
        {busy ? <Loader2 className="animate-spin" /> : null} {pcopy.nudgeCta}
      </Button>
    </div>
  );
}

/** Under the welcome: today's day and date where they're staying, and the weather there now. */
function StayToday({ token, timeZone }: { token: string; timeZone: string }) {
  const fetchWeather = useServerFn(getStayWeather);
  const q = useQuery({ queryKey: ["stay-weather", token], queryFn: () => fetchWeather({ data: { token } }), staleTime: 15 * 60_000 });
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date())), [timeZone]);
  const w = q.data;
  const d = w ? describeWeather(w.code, w.isDay) : null;
  const Icon = d ? WEATHER_ICONS[d.icon] : null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg text-muted-foreground">
      <span className="text-foreground">{today ?? "\u00a0"}</span>
      {w && d && Icon ? (
        <span className="flex items-center gap-1.5">
          <Icon className="size-5 text-accent" aria-hidden />
          <span>{pcopy.weather(w.temp, d.label, w.high, w.low)}</span>
        </span>
      ) : null}
    </p>
  );
}

const WEATHER_ICONS: Record<WeatherIcon, typeof Sun> = {
  sun: Sun,
  moon: Moon,
  "cloud-sun": CloudSun,
  "cloud-moon": CloudMoon,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};
