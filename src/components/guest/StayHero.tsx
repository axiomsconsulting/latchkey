import { CalendarDays, Gift } from "lucide-react";

import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeArt, ThemeIcon } from "@/components/theme/ThemeDecor";
import { Button } from "@/components/ui/button";
import { stayHeroCopy as copy } from "@/content/copy";
import { formatUkDate, nightsBetween } from "@/lib/dates";
import { luminance, type ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { coverFor } from "@/lib/theme-covers";

/**
 * The cover banner at the top of the guest guide: the host's cover photo
 * (or, without one, a panel in the theme's colour with its mark and line
 * art), beside an invitation to add extras. Every template shows it in its
 * own colours, corners, type and buttons.
 */
export function StayCover({ theme, name, extras, onExtras }: { theme: ThemeConfig; name: string; extras: boolean; onExtras: () => void }) {
  const centred = theme.layout === "centred";
  // A dark template (gold on navy) keeps its panel dark with the accent's line work; a light one uses its main colour.
  const dark = luminance(theme.background) < 0.2;
  const cover = coverFor(theme);
  return (
    <section className={cn("card-soft grid overflow-hidden p-0", extras ? "sm:grid-cols-[1.15fr_1fr]" : "")} aria-label={copy.coverLabel}>
      {cover ? (
        <img src={cover} alt="" width={1280} height={768} className={cn("h-full w-full object-cover", extras ? "aspect-[16/10] sm:aspect-auto sm:min-h-64" : "aspect-[16/7]")} />
      ) : (
        <div
          className={cn("relative flex items-center justify-center overflow-hidden", dark ? "border-b border-border sm:border-b-0 sm:border-r" : "bg-primary text-primary-foreground", extras ? "aspect-[16/9] sm:aspect-auto sm:min-h-64" : "aspect-[16/6]")}
          style={dark ? { background: theme.background, color: theme.accent } : undefined}
        >
          <ThemeArt artwork={theme.artwork === "none" ? "hills" : theme.artwork} className="absolute inset-x-0 bottom-0 h-1/2 opacity-25" />
          <div className="relative flex flex-col items-center gap-3 px-6 text-center">
            <LogoMark theme={theme} name={name} className={cn("size-16 bg-transparent text-2xl ring-0", dark ? "text-accent" : "text-primary-foreground")} />
            <p className="font-display text-2xl uppercase tracking-[0.12em]">{name}</p>
            {theme.subname ? <p className="text-xs uppercase tracking-[0.4em] opacity-85">{theme.subname}</p> : null}
          </div>
        </div>
      )}
      {extras ? (
        <div className={cn("flex flex-col justify-center gap-3 p-6 sm:p-8", centred && "items-center text-center")}>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">{copy.eyebrow}</p>
          <h2 className="text-2xl leading-tight sm:text-3xl">{copy.title}</h2>
          <p className="text-muted-foreground">{copy.body}</p>
          <Button size="lg" className={cn("mt-2 h-12", centred ? "self-center" : "self-stretch sm:self-start")} onClick={onExtras}>
            <Gift className="size-5" /> {copy.cta}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The stay at a glance: a pill with arrival and departure times (and the
 * Wi-Fi name), then the dates and the room, in the theme's icon style.
 */
export function StaySummary({
  theme,
  checkInDate,
  checkInTime,
  checkOutDate,
  checkOutTime,
  wifi,
  room,
}: {
  theme: ThemeConfig;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  wifi: string | null;
  room: { name: string; title: string | null } | null;
}) {
  const nights = nightsBetween(checkInDate, checkOutDate);
  const pill = [copy.inFrom(checkInTime), copy.outBy(checkOutTime, formatUkDate(checkOutDate)), wifi ? copy.wifi(wifi) : null].filter(Boolean) as string[];
  const label = "text-xs font-semibold uppercase tracking-[0.25em] text-accent";
  return (
    <div className="space-y-3">
      {/* One line on wider screens; on a phone, one item per line. */}
      <p className="flex flex-col items-center gap-x-3 gap-y-1 bg-secondary px-5 py-2.5 text-center text-sm font-medium text-secondary-foreground sm:flex-row sm:flex-wrap sm:justify-center" style={{ borderRadius: theme.buttonRadius >= 1 ? "var(--radius-button)" : "var(--radius-lg)" }}>
        {pill.map((p, i) => (
          <span key={p} className="flex items-center gap-3">
            {i > 0 ? <span aria-hidden className="hidden size-1 rounded-full bg-current opacity-50 sm:block" /> : null}
            {p}
          </span>
        ))}
      </p>
      <div className={cn("grid gap-3", room ? "sm:grid-cols-2" : "")}>
        <div className="card-soft flex items-center gap-4 p-5">
          {theme.iconFrame === "none" ? <CalendarDays className="size-9 shrink-0" style={{ color: "var(--icon)" }} aria-hidden /> : <ThemeIcon theme={theme} icon="calendar-days" />}
          <div>
            <p className={label}>{copy.yourStay}</p>
            <p className="text-lg">
              {formatUkDate(checkInDate)} – {formatUkDate(checkOutDate, { withYear: true })}
            </p>
            <p className="text-sm text-muted-foreground">{copy.nights(nights)}</p>
          </div>
        </div>
        {room ? (
          <div className="card-soft flex items-center gap-4 p-5">
            <ThemeIcon theme={theme} icon="building-2" className={theme.iconFrame === "none" ? "size-9" : undefined} />
            <div className="min-w-0">
              <p className={label}>{copy.room}</p>
              <p className="truncate text-lg">{room.name}</p>
              {room.title ? <p className="truncate text-sm text-muted-foreground">{room.title}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "Need something?": straight to a message to the host. */
export function StayHelp({ theme, onMessage }: { theme: ThemeConfig; onMessage: () => void }) {
  return (
    <section className="card-soft flex flex-wrap items-center gap-4 p-5">
      <ThemeIcon theme={theme} icon="message-circle" className={theme.iconFrame === "none" ? "size-9" : undefined} />
      <div className="min-w-[12rem] flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">{copy.helpEyebrow}</p>
        <p>{copy.helpBody}</p>
      </div>
      <Button size="lg" className="h-12 w-full sm:w-auto" onClick={onMessage}>
        {copy.helpCta}
      </Button>
    </section>
  );
}
