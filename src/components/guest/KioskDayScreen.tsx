import { useEffect, useState, type ReactNode } from "react";
import { LogIn } from "lucide-react";

import { useQrImage } from "@/components/guest/CheckInQr";
import { useNow } from "@/components/guest/KioskClocks";
import { guest as copy } from "@/content/copy";
import { burnDrift } from "@/lib/kiosk-clock";

/** The time and date in the property's time zone, for the top of a resting screen. */
export function DigitalClockBar({ tz, className = "" }: { tz: string; className?: string }) {
  const now = useNow(15_000);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);
  return (
    <p className={`flex items-baseline gap-[0.5em] tabular-nums ${className}`}>
      <span className="font-bold">{time}</span>
      <span className="text-[0.6em] opacity-80">{date}</span>
    </p>
  );
}

/**
 * The Smart Screensaver by day: a larger logo, Check in with the QR code for a
 * guest's own phone, and the time and date along the top. It drifts very slowly so
 * nothing burns in. A tap anywhere comes back to the usual screen; Check in starts.
 */
export function KioskDayScreen({
  name,
  tz,
  logo,
  qrUrl,
  onWake,
  onCheckIn,
}: {
  name: string;
  tz: string;
  logo: ReactNode;
  qrUrl: string | null;
  onWake: () => void;
  onCheckIn: () => void;
}) {
  const qr = useQrImage(qrUrl, { dark: "#000000ff", light: "#ffffffff" });
  const [drift, setDrift] = useState(() => burnDrift(Date.now()));
  useEffect(() => {
    const id = window.setInterval(() => setDrift(burnDrift(Date.now())), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={copy.dayScreenWake}
      onClick={onWake}
      onKeyDown={onWake}
      className="fixed inset-0 z-[93] flex select-none flex-col bg-background text-foreground"
    >
      <header className="flex items-center justify-end p-[2rem]">
        <DigitalClockBar tz={tz} className="text-[clamp(2.25rem,6vmin,4.5rem)]" />
      </header>
      <div
        className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-x-[5rem] gap-y-[2rem] px-[2rem] pb-[3rem] transition-transform duration-[20s]"
        style={{ transform: `translate(${drift.x / 2}px, ${drift.y / 2}px)` }}
      >
        <div className="flex flex-col items-center gap-[1.5rem] text-center">
          {logo}
          <h1 className="font-display text-[clamp(2.25rem,6vmin,4.5rem)]">{name}</h1>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCheckIn();
            }}
            className="inline-flex min-h-[4.5rem] items-center gap-3 rounded-full bg-primary px-[3rem] text-[clamp(1.5rem,3.5vmin,2.5rem)] font-bold text-primary-foreground"
          >
            <LogIn className="size-[1em]" aria-hidden /> {copy.dayScreenCheckIn}
          </button>
        </div>
        {qr ? (
          <figure className="flex flex-col items-center gap-[0.75rem]">
            <img
              src={qr}
              alt=""
              className="size-[clamp(10rem,30vmin,18rem)] rounded-2xl bg-white p-3"
            />
            <figcaption className="text-[clamp(1rem,2.2vmin,1.5rem)]">
              {copy.dayScreenQr}
            </figcaption>
          </figure>
        ) : null}
      </div>
    </div>
  );
}
