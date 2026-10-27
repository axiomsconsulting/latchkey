import { useState } from "react";
import { CalendarDays, Download, ExternalLink, Gift, KeyRound } from "lucide-react";

import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeArt, ThemeIcon } from "@/components/theme/ThemeDecor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { stayHeroCopy as copy } from "@/content/copy";
import { formatUkDate, nightsBetween } from "@/lib/dates";
import { luminance, type ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { stayProgressCopy as pcopy } from "@/content/copy";
import type { StayProgress } from "@/lib/stay-access";
import { coverFor } from "@/lib/theme-covers";
import { tilesPerRow, type GuideTile, type ShownTile } from "@/lib/guide-tiles";

/**
 * The cover banner at the top of the guest guide: the host's cover photo
 * (or, without one, a panel in the theme's colour with its mark and line
 * art), beside an invitation to add extras. Every template shows it in its
 * own colours, corners, type and buttons.
 */
export type CoverInvite = {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  href?: string;
  onClick?: () => void;
  icon?: "gift" | "key";
};

export function StayCover({
  theme,
  name,
  extras,
  onExtras,
  invite,
  photo,
}: {
  theme: ThemeConfig;
  name: string;
  /** A room's own cover photo, used before the property's. */
  photo?: string | null | undefined;
  /** The stay guide: the extras invitation beside the cover. */
  extras: boolean;
  onExtras?: () => void;
  /** Or any other invitation beside it (the room guide: check in or open your stay). */
  invite?: CoverInvite | undefined;
}) {
  const side: CoverInvite | null =
    invite ??
    (extras
      ? {
          eyebrow: copy.eyebrow,
          title: copy.title,
          body: copy.body,
          cta: copy.cta,
          icon: "gift",
          ...(onExtras ? { onClick: onExtras } : {}),
        }
      : null);
  const centred = theme.layout === "centred";
  // A dark template (gold on navy) keeps its panel dark with the accent's line work; a light one uses its main colour.
  const dark = luminance(theme.background) < 0.2;
  const cover = photo || coverFor(theme);
  return (
    <section
      className={cn("card-soft grid overflow-hidden p-0", side ? "sm:grid-cols-[1.15fr_1fr]" : "")}
      aria-label={copy.coverLabel}
    >
      {cover ? (
        <div className="relative h-full">
          <img
            src={cover}
            alt=""
            width={1280}
            height={768}
            className={cn(
              "h-full w-full object-cover",
              side ? "aspect-[16/10] sm:aspect-auto sm:min-h-64" : "aspect-[16/7]",
            )}
          />
          {/* The property's logo and name on the photo, so the cover is always theirs. */}
          {name ? (
            <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-2xl bg-background/85 py-1.5 pl-1.5 pr-4 shadow-soft backdrop-blur-sm">
              <LogoMark theme={theme} name={name} className="size-10 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate font-display text-base leading-tight text-foreground">
                  {name}
                </span>
                {theme.subname ? (
                  <span className="block truncate text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    {theme.subname}
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "relative flex items-center justify-center overflow-hidden",
            dark
              ? "border-b border-border sm:border-b-0 sm:border-r"
              : "bg-primary text-primary-foreground",
            side ? "aspect-[16/9] sm:aspect-auto sm:min-h-64" : "aspect-[16/6]",
          )}
          style={dark ? { background: theme.background, color: theme.accent } : undefined}
        >
          <ThemeArt
            artwork={theme.artwork === "none" ? "hills" : theme.artwork}
            className="absolute inset-x-0 bottom-0 h-1/2 opacity-25"
          />
          <div className="relative flex flex-col items-center gap-3 px-6 text-center">
            <LogoMark
              theme={theme}
              name={name}
              className={cn(
                "size-16 bg-transparent text-2xl ring-0",
                dark ? "text-accent" : "text-primary-foreground",
              )}
            />
            <p className="font-display text-2xl uppercase tracking-[0.12em]">{name}</p>
            {theme.subname ? (
              <p className="text-xs uppercase tracking-[0.4em] opacity-85">{theme.subname}</p>
            ) : null}
          </div>
        </div>
      )}
      {side ? (
        <div
          className={cn(
            "flex flex-col justify-center gap-3 p-6 sm:p-8",
            centred && "items-center text-center",
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            {side.eyebrow}
          </p>
          <h2 className="text-2xl leading-tight sm:text-3xl">{side.title}</h2>
          <p className="text-muted-foreground">{side.body}</p>
          {side.href ? (
            <Button
              asChild
              size="lg"
              className={cn("mt-2 h-12", centred ? "self-center" : "self-stretch sm:self-start")}
            >
              <a href={side.href}>
                {side.icon === "key" ? (
                  <KeyRound className="size-5" />
                ) : (
                  <Gift className="size-5" />
                )}{" "}
                {side.cta}
              </a>
            </Button>
          ) : (
            <Button
              size="lg"
              className={cn("mt-2 h-12", centred ? "self-center" : "self-stretch sm:self-start")}
              onClick={side.onClick}
            >
              {side.icon === "key" ? <KeyRound className="size-5" /> : <Gift className="size-5" />}{" "}
              {side.cta}
            </Button>
          )}
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
  progress,
}: {
  theme: ThemeConfig;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  wifi: string | null;
  room: { name: string; title: string | null } | null;
  /** Where they are in the stay: "Night 2 of 3 · 2 nights to go" instead of the count. */
  progress?: StayProgress;
}) {
  const nights = nightsBetween(checkInDate, checkOutDate);
  const pill = [
    copy.inFrom(checkInTime),
    copy.outBy(checkOutTime, formatUkDate(checkOutDate)),
    wifi ? copy.wifi(wifi) : null,
  ].filter(Boolean) as string[];
  const label = "text-xs font-semibold uppercase tracking-[0.25em] text-accent";
  return (
    <div className="space-y-3">
      {/* One line on wider screens; on a phone, one item per line. */}
      <p
        className="flex flex-col items-center gap-x-3 gap-y-1 bg-secondary px-5 py-2.5 text-center text-sm font-medium text-secondary-foreground sm:flex-row sm:flex-wrap sm:justify-center"
        style={{
          borderRadius: theme.buttonRadius >= 1 ? "var(--radius-button)" : "var(--radius-lg)",
        }}
      >
        {pill.map((p, i) => (
          <span key={p} className="flex items-center gap-3">
            {i > 0 ? (
              <span
                aria-hidden
                className="hidden size-1 rounded-full bg-current opacity-50 sm:block"
              />
            ) : null}
            {p}
          </span>
        ))}
      </p>
      <div className={cn("grid gap-3", room ? "sm:grid-cols-2" : "")}>
        <div className="card-soft flex items-center gap-4 p-5">
          {theme.iconFrame === "none" ? (
            <CalendarDays
              className="size-9 shrink-0"
              style={{ color: "var(--icon)" }}
              aria-hidden
            />
          ) : (
            <ThemeIcon theme={theme} icon="calendar-days" />
          )}
          <div>
            <p className={label}>{copy.yourStay}</p>
            <p className="text-lg">
              {formatUkDate(checkInDate)} – {formatUkDate(checkOutDate, { withYear: true })}
            </p>
            <p className="text-sm text-muted-foreground">
              {progress ? progressLine(progress) : copy.nights(nights)}
            </p>
          </div>
        </div>
        {room ? (
          <div className="card-soft flex items-center gap-4 p-5">
            <ThemeIcon
              theme={theme}
              icon="building-2"
              className={theme.iconFrame === "none" ? "size-9" : undefined}
            />
            <div className="min-w-0">
              <p className={label}>{copy.room}</p>
              <p className="truncate text-lg">{room.name}</p>
              {room.title ? (
                <p className="truncate text-sm text-muted-foreground">{room.title}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The stay's night, in guest words. */
function progressLine(p: StayProgress): string {
  if (p.phase === "during" || p.phase === "arrival") return pcopy.during(p.night, p.nights, p.left);
  if (p.phase === "leaving") return pcopy.leaving;
  return pcopy.before(p.nights);
}

/**
 * Quick ways in at the top of a guide, in the theme's icon style: one row
 * you can swipe on a phone, a tidy grid on wider screens.
 */
/**
 * The quick tiles under the welcome (src/lib/guide-tiles.ts): up to eight,
 * sharing the full width in even rows on a phone (5 → 3 + 2) and one row on
 * wider screens. The host's own tiles open in place: text, a photo, a PDF or
 * a web page, without leaving the guide.
 */
export function GuideTiles({
  theme,
  label,
  tiles,
  stored,
  files,
  onAction,
}: {
  theme: ThemeConfig;
  label: string;
  tiles: ShownTile[];
  /** The host's tiles as saved, for their content. */
  stored: GuideTile[] | null;
  /** Short-lived links to each tile's photo or PDF, by tile id. */
  files: Record<string, string>;
  onAction: (action: Exclude<ShownTile["action"], { kind: "open" }>) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (tiles.length < 2) return null;
  const per = tilesPerRow(tiles.length);
  const wide = Math.min(tiles.length, 8);
  const opened = stored?.find((t) => t.id === openId) ?? null;
  return (
    <>
      <nav
        aria-label={label}
        className="flex flex-wrap gap-2"
        style={{
          ["--tile-basis" as string]: `calc((100% - ${(per - 1) * 0.5}rem) / ${per})`,
          ["--tile-basis-wide" as string]: `calc((100% - ${(wide - 1) * 0.5}rem) / ${wide})`,
        }}
      >
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              t.action.kind === "open" ? setOpenId(t.action.tileId) : onAction(t.action)
            }
            className="card-soft flex min-h-20 min-w-0 grow basis-[var(--tile-basis)] flex-col items-center justify-center gap-1.5 px-1 py-3 text-center text-xs leading-tight min-[400px]:text-[13px] hover:bg-secondary sm:min-h-24 sm:basis-[var(--tile-basis-wide)] sm:gap-2 sm:p-3 sm:text-sm"
          >
            <ThemeIcon theme={theme} icon={t.icon} className="size-6 sm:size-7" />
            <span lang="en" className="line-clamp-2 w-full hyphens-auto">
              {t.label}
            </span>
          </button>
        ))}
      </nav>
      <Dialog open={!!opened} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          {opened?.content ? (
            <TileContentView tile={opened} src={files[opened.id] ?? null} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TileContentView({ tile, src }: { tile: GuideTile; src: string | null }) {
  const c = tile.content!;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">{tile.title}</DialogTitle>
        <DialogDescription className="sr-only">{tile.title}</DialogDescription>
      </DialogHeader>
      {c.type === "text" ? (
        <p className="whitespace-pre-line text-lg leading-relaxed">{c.body}</p>
      ) : null}
      {c.type === "image" && src ? (
        <img
          src={src}
          alt={tile.title ?? ""}
          className="max-h-[70dvh] w-full rounded-2xl object-contain"
        />
      ) : null}
      {c.type === "doc" && src ? (
        <div className="space-y-3">
          <iframe
            src={src}
            title={tile.title ?? c.name ?? ""}
            className="h-[65dvh] w-full rounded-2xl border border-border bg-surface"
          />
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href={src} target="_blank" rel="noreferrer" download={c.name}>
              <Download className="size-4" /> {copy.tileDownload(c.name ?? "PDF")}
            </a>
          </Button>
        </div>
      ) : null}
      {c.type === "link" && c.url ? (
        <div className="space-y-3">
          {/* Shown inside the guide; some sites refuse to be shown inside another page, so the link is always there too. */}
          <iframe
            src={c.url}
            title={tile.title ?? c.url}
            className="h-[65dvh] w-full rounded-2xl border border-border bg-surface"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
          />
          <p className="text-sm text-muted-foreground">{copy.tileLinkHint}</p>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href={c.url} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="size-4" /> {copy.tileOpenSite}
            </a>
          </Button>
        </div>
      ) : null}
      {(c.type === "image" || c.type === "doc") && !src ? (
        <p className="text-muted-foreground">{copy.tileMissing}</p>
      ) : null}
    </>
  );
}

/** A one-line pill in the theme's shape (e.g. the Wi-Fi name and password). */
export function InfoPill({ theme, items }: { theme: ThemeConfig; items: string[] }) {
  if (!items.length) return null;
  return (
    <p
      className="flex flex-col items-center gap-x-3 gap-y-1 bg-secondary px-5 py-2.5 text-center text-sm font-medium text-secondary-foreground sm:flex-row sm:flex-wrap sm:justify-center"
      style={{
        borderRadius: theme.buttonRadius >= 1 ? "var(--radius-button)" : "var(--radius-lg)",
      }}
    >
      {items.map((p, i) => (
        <span key={p} className="flex items-center gap-3">
          {i > 0 ? (
            <span
              aria-hidden
              className="hidden size-1 rounded-full bg-current opacity-50 sm:block"
            />
          ) : null}
          {p}
        </span>
      ))}
    </p>
  );
}
