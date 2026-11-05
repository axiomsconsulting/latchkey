import { useNow } from "@/components/guest/KioskClocks";

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
