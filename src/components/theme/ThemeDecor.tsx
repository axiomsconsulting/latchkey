import type { ReactNode } from "react";

import { SiteLogoMark } from "@/components/brand/BrandLogo";
import { LogoMark } from "@/components/theme/LogoMark";
import { NAV_ICONS } from "@/components/NavIcon";
import { brandName } from "@/lib/brand";
import type { Artwork, ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

/* ------------------------------- line art -------------------------------- */

const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** A town's roofline: spires, a dome, towers and gables. */
function Skyline() {
  return (
    <svg viewBox="0 0 640 220" preserveAspectRatio="xMinYMax meet" className="h-full w-full" aria-hidden>
      <g {...line}>
        <path d="M0 220V170h40v-30h18v30h22V120l14-40 14 40v100" />
        <path d="M108 220V150h50v70M120 150v-20h26v20" />
        <path d="M158 220V100c0-30 50-30 50 0v120M170 100c0-18 26-18 26 0M183 62v-22M178 46h10" />
        <path d="M208 220V140h34l10-30 10 30h30v80" />
        <path d="M292 220V60l16-50 16 50v160M300 90h16M300 130h16" />
        <path d="M324 220V130h60v90M334 150h12M360 150h12M334 175h12M360 175h12" />
        <path d="M384 220V96h18V70h10v26h18v124" />
        <path d="M430 220v-60l30-26 30 26v60M450 220v-30h20v30" />
        <path d="M490 220V112l20-30 20 30v108M510 82V60" />
        <path d="M530 220v-50h40v-24h16v24h30v50" />
        <path d="M0 220h640" />
      </g>
    </svg>
  );
}

/** A classical facade with a lamp post, for one side of the screen. */
function Palace() {
  return (
    <svg viewBox="0 0 260 420" preserveAspectRatio="xMinYMax meet" className="h-full w-full" aria-hidden>
      <g {...line}>
        <path d="M10 420V130h170v290M0 130h190M5 118h180M20 118l75-48 75 48" />
        <path d="M95 70V50M88 50h14M95 50a7 7 0 0 1 0-14" />
        {[30, 70, 110, 150].map((x) => (
          <g key={x}>
            <path d={`M${x} 160h22v60h-22zM${x} 250h22v60h-22zM${x} 340h22v60h-22z`} />
            <path d={`M${x - 3} 160h28M${x - 3} 250h28M${x - 3} 340h28`} />
          </g>
        ))}
        <path d="M10 240h170M10 330h170" />
        <path d="M215 420V250M205 420h20M210 250h10l4-26h-18zM208 224l7-10 7 10M215 214v-8" />
        <path d="M180 420v-70h60v70M190 350v-10h40v10" />
        {[190, 202, 214, 226].map((x) => (
          <path key={x} d={`M${x} 420v-62`} />
        ))}
        <path d="M0 420h260" />
      </g>
    </svg>
  );
}

/** Dunes under a star, with a palm. */
function Dunes() {
  return (
    <svg viewBox="0 0 640 200" preserveAspectRatio="xMinYMax meet" className="h-full w-full" aria-hidden>
      <g {...line}>
        <path d="M0 160c80-40 160-40 240 0s160 40 240 0 120-30 160-10" />
        <path d="M0 190c100-30 200-30 300 0s200 30 340-10" />
        <path d="M120 150V96M120 96c-12-10-30-10-40 0M120 96c10-14 30-16 40-8M120 96c-6-16-2-30 8-36M120 96c-16-4-26 6-30 18M120 96c14-2 26 8 28 20" />
        <path d="M500 40l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
        <path d="M0 200h640" />
      </g>
    </svg>
  );
}

/** Waves, a lighthouse and a gull. */
function Coast() {
  return (
    <svg viewBox="0 0 640 200" preserveAspectRatio="xMinYMax meet" className="h-full w-full" aria-hidden>
      <g {...line}>
        <path d="M0 170c20-10 40-10 60 0s40 10 60 0 40-10 60 0 40 10 60 0 40-10 60 0 40 10 60 0 40-10 60 0 40 10 60 0 40-10 60 0 40 10 60 0" />
        <path d="M0 190c20-10 40-10 60 0s40 10 60 0 40-10 60 0 40 10 60 0 40-10 60 0 40 10 60 0 40-10 60 0 40 10 60 0 40-10 60 0 40 10 60 0" />
        <path d="M520 165l10-110h20l10 110M526 120h28M532 80h16M530 55h20l-4-14h-12zM540 41v-8" />
        <path d="M440 70c6-6 12-6 16 0 4-6 10-6 16 0" />
      </g>
    </svg>
  );
}

/** Rolling hills, a cottage and trees. */
function Hills() {
  return (
    <svg viewBox="0 0 640 200" preserveAspectRatio="xMinYMax meet" className="h-full w-full" aria-hidden>
      <g {...line}>
        <path d="M0 150c100-60 200-60 320-10s220 40 320-20" />
        <path d="M0 185c140-40 300-40 420-10s160 20 220 0" />
        <path d="M380 150v-34l24-20 24 20v34M398 150v-16h12v16M380 116h48" />
        <path d="M200 140v-20M200 120c-14 0-16-26 0-34 16 8 14 34 0 34M240 132v-14M240 118c-10 0-12-18 0-24 12 6 10 24 0 24" />
        <path d="M0 200h640" />
      </g>
    </svg>
  );
}

const ART: Record<Exclude<Artwork, "none">, () => ReactNode> = { skyline: Skyline, palace: Palace, dunes: Dunes, coast: Coast, hills: Hills };

/** One of the theme's line drawings on its own (for a panel), in the current text colour. */
export function ThemeArt({ artwork, className }: { artwork: Artwork; className?: string }) {
  if (artwork === "none") return null;
  const Art = ART[artwork];
  return (
    <div aria-hidden className={className}>
      <Art />
    </div>
  );
}

/** A flourish for each corner of an ornate frame. */
function Flourish({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("absolute size-10", className)} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M4 20c0-9 7-16 16-16" />
        <path d="M10 20c0-5 5-10 10-10" />
        <path d="M4 4l6 6M4 4h6M4 4v6" />
        <circle cx="14" cy="14" r="1.6" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/**
 * The page's backdrop: the theme's line art (in its accent colour, faint)
 * and its frame. Sits behind everything and never takes a tap.
 */
export function ThemeBackdrop({ theme }: { theme: ThemeConfig }) {
  const Art = theme.artwork !== "none" ? ART[theme.artwork] : null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ color: "var(--accent)" }}>
      {Art ? (
        theme.artwork === "palace" ? (
          <div style={{ opacity: theme.artworkOpacity }}>
            <div className="absolute bottom-0 left-0 h-[70%] max-h-[34rem] w-[22%] max-w-[16rem]">
              <Art />
            </div>
            <div className="absolute bottom-0 right-0 h-[70%] max-h-[34rem] w-[22%] max-w-[16rem] -scale-x-100">
              <Art />
            </div>
          </div>
        ) : (
          <div className="absolute bottom-0 left-0 h-[26%] max-h-56 w-[60%] min-w-[20rem]" style={{ opacity: theme.artworkOpacity }}>
            <Art />
          </div>
        )
      ) : null}
      {theme.frame !== "none" ? (
        <div className="absolute inset-2 sm:inset-3">
          <div className="absolute inset-0 border" style={{ borderColor: "color-mix(in srgb, var(--accent) 65%, transparent)" }} />
          {theme.frame === "ornate" ? (
            <>
              <div className="absolute inset-1.5 border" style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }} />
              <Flourish className="left-0 top-0" />
              <Flourish className="right-0 top-0 -scale-x-100" />
              <Flourish className="bottom-0 left-0 -scale-y-100" />
              <Flourish className="bottom-0 right-0 -scale-100" />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ brand blocks ------------------------------ */

/** A line either side of short words ("— St James's —"). */
function Ruled({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("flex items-center justify-center gap-3", className)}>
      <span className="h-px w-10 bg-current opacity-50" />
      <span>{children}</span>
      <span className="h-px w-10 bg-current opacity-50" />
    </span>
  );
}

/**
 * The property's mark as the theme shows it on welcome screens: centred
 * (crest, name in the heading style, the line under it ruled) or to the left.
 */
export function BrandBlock({ theme, name, size = "lg", className }: { theme: ThemeConfig; name: string; size?: "md" | "lg"; className?: string }) {
  if (theme.layout === "centred") {
    return (
      <div className={cn("flex flex-col items-center text-center", className)}>
        {/* A drawn mark stands on its own in the main colour, like a crest; a monogram or uploaded logo keeps its tile. */}
        <LogoMark
          theme={theme}
          name={name}
          className={cn(size === "lg" ? "size-20 text-3xl" : "size-14 text-2xl", !theme.logoUrl && theme.logoPreset !== "monogram" && "bg-transparent text-primary")}
        />
        <p
          className="mt-4 font-display uppercase tracking-[0.18em]"
          style={{ fontSize: size === "lg" ? "1.5rem" : "1.15rem", fontWeight: theme.headingWeight }}
        >
          {name}
        </p>
        {theme.subname ? <Ruled className="mt-1.5 text-sm uppercase tracking-[0.3em] text-muted-foreground">{theme.subname}</Ruled> : null}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark theme={theme} name={name} className={size === "lg" ? "size-16 text-2xl" : "size-11"} />
      <div className="min-w-0">
        <p className="truncate font-display text-xl leading-tight sm:text-2xl" style={{ fontWeight: theme.headingWeight }}>
          {name}
        </p>
        {theme.subname ? <p className="truncate font-display text-lg leading-tight text-primary">{theme.subname}</p> : null}
        {theme.tagline ? <p className="mt-0.5 truncate text-xs uppercase tracking-[0.2em] text-muted-foreground">{theme.tagline}</p> : null}
      </div>
    </div>
  );
}

/** An icon in the theme's own style: its colour, line weight and (optional) circle or square. */
export function ThemeIcon({ theme, icon, className }: { theme: ThemeConfig; icon: string; className?: string | undefined }) {
  const Icon = NAV_ICONS[icon] ?? NAV_ICONS["sparkles"]!;
  const glyph = <Icon className={cn("size-6", className)} style={{ color: "var(--icon)" }} aria-hidden />;
  if (theme.iconFrame === "none") return glyph;
  return (
    <span
      className={cn("grid size-12 shrink-0 place-items-center", theme.iconFrame === "circle" ? "rounded-full" : "rounded-md")}
      style={{ background: "color-mix(in srgb, var(--icon) 12%, transparent)" }}
    >
      {glyph}
    </span>
  );
}

/** Up to three short features ("Right in the heart of town"), each with an icon. */
export function ThemeFeatures({ theme, className }: { theme: ThemeConfig; className?: string }) {
  if (!theme.features.length) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-6 gap-y-3", className)}>
      {theme.features.map((f) => (
        <li key={f.text} className="flex max-w-[12rem] items-center gap-3 text-sm leading-tight">
          <ThemeIcon theme={theme} icon={f.icon} />
          <span>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** The two short notes in the upper corners of a wide welcome screen (only where there's room beside the welcome). */
export function ThemeSideNotes({ theme }: { theme: ThemeConfig }) {
  const [left, right] = theme.sideNotes;
  if (!left && !right) return null;
  const note = (text: string, side: "left" | "right") =>
    text ? (
      <div className={cn("absolute top-24 hidden max-w-[11rem] text-xs uppercase leading-relaxed tracking-[0.3em] min-[1360px]:block", side === "left" ? "left-10 text-left" : "right-10 text-right")} style={{ color: "var(--accent)" }}>
        {text.split("·").map((t) => (
          <span key={t} className="block">
            {t.trim()}
          </span>
        ))}
        <span className={cn("mt-3 block h-px w-12 bg-current opacity-60", side === "right" ? "ml-auto" : "")} />
      </div>
    ) : null;
  return (
    <>
      {note(left, "left")}
      {note(right, "right")}
    </>
  );
}

/** The foot of a guest page: the theme's line, and "Powered by <product>" if the host shows it. */
export function ThemeFooter({ theme, className }: { theme: ThemeConfig; className?: string }) {
  if (!theme.tagline && !theme.poweredBy) return null;
  return (
    <footer className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground", className)}>
      <span className="uppercase tracking-[0.25em]">{theme.tagline}</span>
      {theme.poweredBy ? (
        <span className="flex items-center gap-1.5">
          Powered by <SiteLogoMark className="size-4 rounded-[5px]" /> <span className="font-semibold text-foreground">{brandName()}</span>
        </span>
      ) : null}
    </footer>
  );
}
