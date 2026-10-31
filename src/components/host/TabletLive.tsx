import { useEffect, useRef, useState } from "react";
import { Eye, Loader2, Maximize, MonitorSmartphone, Moon } from "lucide-react";

import { KioskGoodbyeScreen } from "@/components/guest/KioskGoodbye";
import { useNow } from "@/components/guest/KioskClocks";
import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { kioskPreviewCopy as copy } from "@/content/copy";
import { useLatestVersion } from "@/hooks/use-app-update";
import { newerVersion } from "@/lib/app-update";
import { zonedParts } from "@/lib/dates";
import { useLiveScreens, type LiveScreens } from "@/hooks/use-tablet-live";
import { isOnline, tabletName } from "@/lib/kiosk-devices";
import { stopWatchingKiosks, watchKiosks, type KioskDevice } from "@/lib/kiosk-devices.functions";
import { kioskPinger } from "@/lib/kiosk-ping";
import { stepWords } from "@/lib/kiosk-screen";
import { cn } from "@/lib/utils";

type Property = { id: string; short_code: string };

function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** One tablet screen, drawn at the tablet's own size and scaled down to fit its box. */
export function Frame({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / w);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden rounded-xl border-4 border-neutral-800 bg-neutral-800 shadow"
      style={{ aspectRatio: `${w} / ${h}` }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: w, height: h, transform: `scale(${scale})` }}
      >
        <div className="relative h-full w-full">{children}</div>
      </div>
    </div>
  );
}

/** One tablet's camera picture, as it comes in. */
export function CameraShot({
  device,
  shot,
}: {
  device: KioskDevice;
  shot: { image: string; takenAt: string } | undefined;
}) {
  return (
    <figure className="overflow-hidden rounded-xl bg-black">
      {shot ? (
        <img
          src={shot.image}
          alt={`${tabletName(device)}: camera`}
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="grid aspect-[4/3] w-full place-items-center text-white/70">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      <figcaption className="px-3 py-1.5 text-xs text-white/80">
        {shot ? ago(shot.takenAt) : "Connecting…"}
      </figcaption>
    </figure>
  );
}

/**
 * What this tablet shows now, as close to its own screen as Latchkey can
 * draw it: the screen it reported (start, cards on the page they're on now,
 * your welcome, screensaver or night light, the check-in step), at its own
 * size, in the property's look, with the property's clock and the version
 * and name in its corner, as on the tablet.
 */
export function TabletScreen({
  device,
  live,
  code,
}: {
  device: KioskDevice;
  live: LiveScreens | undefined;
  code: string;
}) {
  const now = useNow(1000);
  const latest = useLatestVersion();
  const t = live?.tablets.find((x) => x.id === device.id) ?? live?.tablets[0];
  const w = device.display?.usedW || device.display?.w || t?.w || 1280;
  const h = device.display?.usedH || device.display?.h || t?.h || 800;
  if (!live || !t)
    return (
      <Frame w={w} h={h}>
        <div className="grid h-full place-items-center bg-neutral-900">
          <Loader2 className="size-16 animate-spin text-white/60" />
        </div>
      </Frame>
    );
  const s = device.screen;
  const view = s?.view ?? "start";
  const tz = live.timezone;
  const clock = zonedParts(now, tz).time;
  const online = isOnline(device.lastSeenAt, Date.now());
  const outOfDate = !!device.appVersion && !!latest && newerVersion(latest, device.appVersion);
  const dark = view === "saver" || view === "night" || view === "blank";

  return (
    <Frame w={w} h={h}>
      <ThemeScope theme={live.theme} full className="relative h-full w-full bg-background">
        {/* The kiosk's header: logo, name and the clock. */}
        {!dark ? (
          <header className="flex items-center gap-6 px-12 pt-10">
            <LogoMark theme={live.theme} name={live.name} className="size-24 text-4xl" />
            <span className="flex-1 truncate font-display text-5xl">{live.name}</span>
            <span className="font-display text-7xl tabular-nums">{clock}</span>
          </header>
        ) : null}

        {view === "cards" && t.cards.cards.length ? (
          <KioskGoodbyeScreen
            code={code}
            goodbyes={t.cards}
            contained
            onCheckIn={() => {}}
            onArrive={() => {}}
            onLeft={() => {}}
          />
        ) : view === "welcome" || view === "welcomeRest" ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center bg-primary p-16 text-center text-primary-foreground",
              view === "welcomeRest" && "opacity-60",
            )}
          >
            <p className="font-display text-7xl font-bold leading-tight">
              {t.welcome?.headline ?? copy.screens["welcome"]}
            </p>
            {t.welcome?.body ? <p className="mt-6 text-3xl">{t.welcome.body}</p> : null}
            <p className="mt-12 rounded-full bg-primary-foreground px-10 py-4 text-3xl font-bold text-primary">
              {copy.checkIn}
            </p>
          </div>
        ) : view === "saver" ? (
          <div className="absolute inset-0 grid place-items-center bg-black">
            <span className="font-display text-[10rem] font-extralight tabular-nums text-neutral-500">
              {clock}
            </span>
          </div>
        ) : view === "night" ? (
          <div
            className="absolute inset-0 grid place-items-center"
            style={{ background: "radial-gradient(circle at 50% 60%, #7a4a1c, #2a1606 70%)" }}
          >
            <Moon className="size-32 text-amber-200/60" />
          </div>
        ) : view === "blank" ? (
          <div className="absolute inset-0 bg-black" />
        ) : view === "checkin" || view === "join" ? (
          <div className="absolute inset-x-0 bottom-0 top-36 flex flex-col items-center justify-center gap-6 p-16 text-center">
            <p className="text-3xl text-muted-foreground">
              {view === "join" ? copy.joining : copy.checkingIn}
            </p>
            {view === "checkin" ? (
              <p className="font-display text-7xl">{stepWords(s?.step ?? null)}</p>
            ) : null}
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 top-36 flex flex-col items-center justify-center gap-8 p-16 text-center">
            <p className="font-display text-7xl">
              {live.theme.welcomeTitle
                ? live.theme.welcomeTitle.replace(/\{property\}/g, live.name)
                : copy.startTitle(live.name)}
            </p>
            <p className="text-3xl text-muted-foreground">{copy.startBody}</p>
            <p className="rounded-full bg-primary px-12 py-5 text-3xl font-bold text-primary-foreground">
              {copy.checkIn}
            </p>
          </div>
        )}

        {/* The tablet's own corner: its name, the version it runs, an update waiting. */}
        <div
          className={cn(
            "absolute bottom-3 left-4 z-[95] flex items-center gap-2 text-[20px]",
            dark ? "text-neutral-500" : "text-muted-foreground",
          )}
        >
          <Maximize className="size-4" aria-hidden />
          {tabletName(device)} · v{device.appVersion ?? "?"}
          {outOfDate ? <span className="size-3 rounded-full bg-red-600" aria-hidden /> : null}
          {s?.lite ? <span>· {copy.lite}</span> : null}
        </div>

        {!online ? (
          <div className="absolute inset-0 z-[99] grid place-items-center bg-black/60 text-3xl font-semibold text-white">
            {copy.offline(ago(device.lastSeenAt))}
          </div>
        ) : null}
      </ThemeScope>
    </Frame>
  );
}

/** A line under a live view: which screen, full screen or not, update waiting. */
export function ScreenCaption({ device }: { device: KioskDevice }) {
  const latest = useLatestVersion();
  const s = device.screen;
  if (!s) return <p className="text-xs text-muted-foreground">{copy.noScreen}</p>;
  const outOfDate = !!device.appVersion && !!latest && newerVersion(latest, device.appVersion);
  return (
    <p className="text-xs text-muted-foreground">
      {copy.screens[s.view] ?? s.view}
      {s.view === "checkin" ? `: ${stepWords(s.step)}` : ""} ·{" "}
      {s.fullscreen ? copy.fullscreen : copy.notFullscreen}
      {outOfDate ? ` · ${copy.updateWaiting}` : ""}
    </p>
  );
}

/**
 * Today's kiosk card: "Live View All Tablets" opens every tablet's live view
 * together (Settings → Door tablets flips each tablet's card instead).
 */
export function LiveViewAll({ property, devices }: { property: Property; devices: KioskDevice[] }) {
  const [open, setOpen] = useState(false);
  const live = useLiveScreens(property, open);
  const list = devices.filter((d) => d.status === "confirmed");
  if (!list.length) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Eye className="size-4" /> {copy.open}
      </Button>
      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="max-h-[94dvh] w-[min(96vw,72rem)] max-w-none overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>{copy.body}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              {list.map((d) => (
                <figure key={d.id} className="space-y-1">
                  <figcaption className="flex items-center gap-2 text-sm font-medium">
                    <MonitorSmartphone className="size-4" /> {d.number}. {tabletName(d)}
                  </figcaption>
                  <TabletScreen device={d} live={live.data} code={property.short_code} />
                  <ScreenCaption device={d} />
                </figure>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
