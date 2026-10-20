import { useState } from "react";

import { markArt, SiteLogoMark } from "@/components/brand/BrandLogo";
import type { LogoPreset, ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Six built-in monograms drawn in the theme's colours (currentColor + accent var). */
function Glyph({ preset }: { preset: LogoPreset }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (preset) {
    case "key":
      return (
        <g {...common}>
          <circle cx="17" cy="24" r="7" />
          <path d="M24 24h14M33 24v6M38 24v4" />
          <circle cx="17" cy="24" r="2" fill="var(--accent)" stroke="none" />
        </g>
      );
    case "arch":
      return (
        <g {...common}>
          <path d="M12 38V22a12 12 0 0 1 24 0v16" />
          <path d="M18 38V24a6 6 0 0 1 12 0v14" />
          <path d="M9 38h30" stroke="var(--accent)" />
        </g>
      );
    case "fern":
      return (
        <g {...common}>
          <path d="M24 40V10" />
          <path d="M24 16c-5-1-8-4-9-7M24 22c-6-1-10-4-11-8M24 28c-6 0-10-3-12-6M24 16c5-1 8-4 9-7M24 22c6-1 10-4 11-8M24 28c6 0 10-3 12-6" stroke="var(--accent)" />
        </g>
      );
    case "knot":
      return (
        <g {...common}>
          <path d="M24 10c8 8 8 16 0 22-8-6-8-14 0-22Z" />
          <path d="M11 33c3-11 10-15 20-12-2 10-9 15-20 12Z" stroke="var(--accent)" />
          <path d="M37 33c-3-11-10-15-20-12 2 10 9 15 20 12Z" />
        </g>
      );
    case "lantern":
      return (
        <g {...common}>
          <path d="M20 12h8M24 8v4M17 16h14l-2 18H19Z" />
          <path d="M24 21c2 2 2 5 0 7-2-2-2-5 0-7Z" fill="var(--accent)" stroke="none" />
          <path d="M18 38h12" />
        </g>
      );
    case "sunburst":
      return (
        <g {...common}>
          <path d="M14 38a10 10 0 0 1 20 0" />
          {[-75, -50, -25, 0, 25, 50, 75].map((a) => {
            const r = (a * Math.PI) / 180;
            const x1 = 24 + Math.sin(r) * 14;
            const y1 = 38 - Math.cos(r) * 14;
            const x2 = 24 + Math.sin(r) * 22;
            const y2 = 38 - Math.cos(r) * 22;
            return <path key={a} d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`} stroke="var(--accent)" />;
          })}
          <path d="M8 38h32" />
        </g>
      );
    case "crest":
      return (
        <g {...common}>
          <path d="M19 9h10l-2 4h-6zM21 9l3-4 3 4" />
          <path d="M18 15h12l-1 16H19zM24 18c2 2 2 6 0 8-2-2-2-6 0-8Z" />
          <path d="M18 34c-6-2-9-8-9-14M30 34c6-2 9-8 9-14" stroke="var(--accent)" />
          <path d="M11 24c2 0 4 1 5 3M37 24c-2 0-4 1-5 3M12 18c2 1 3 2 4 4M36 18c-2 1-3 2-4 4" stroke="var(--accent)" />
          <path d="M20 38h8" />
        </g>
      );
    case "leaf":
      return (
        <g {...common}>
          <path d="M13 36C13 20 22 11 36 11c0 15-9 24-23 25Z" />
          <path d="M13 36 30 18" stroke="var(--accent)" />
          <path d="M20 29h6M24 25h5" stroke="var(--accent)" />
        </g>
      );
    default:
      return null;
  }
}

export function LogoMark({
  theme,
  name,
  className,
}: {
  theme: Pick<ThemeConfig, "logoPreset" | "logoUrl">;
  name: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (theme.logoUrl && !broken) {
    return <img src={theme.logoUrl} alt={`${name} logo`} onError={() => setBroken(true)} className={cn("size-10 rounded-xl object-contain", className)} />;
  }
  if (theme.logoPreset === "site") return <SiteLogoMark className={cn("rounded-xl", className)} />;
  const own = theme.logoPreset === "antique-key" ? "key" : theme.logoPreset === "portico" ? "arch" : theme.logoPreset === "serif-l" ? "monogram" : null;
  if (own) {
    // Latchkey's marks in the host's colours: line work in the text colour, the jewel in the accent.
    return (
      <span className={cn("grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground", className)} aria-label={`${name} logo`}>
        <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markArt(own, "currentColor", "var(--accent)") }} />
      </span>
    );
  }
  if (theme.logoPreset === "monogram") {
    const initials = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && w.toLowerCase() !== "the").slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "L";
    return (
      <span className={cn("grid size-10 place-items-center rounded-xl bg-primary font-display text-lg text-primary-foreground ring-2 ring-accent/60 ring-offset-2 ring-offset-background", className)} aria-label={`${name} logo`}>
        {initials}
      </span>
    );
  }
  return (
    <span className={cn("grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground", className)} aria-label={`${name} logo`}>
      <svg viewBox="0 0 48 48" className="size-[80%]" aria-hidden="true">
        <Glyph preset={theme.logoPreset} />
      </svg>
    </span>
  );
}
