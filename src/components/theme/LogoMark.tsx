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
  if (theme.logoUrl) {
    return <img src={theme.logoUrl} alt={`${name} logo`} className={cn("size-10 rounded-xl object-contain", className)} />;
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
