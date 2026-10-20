import { useState } from "react";

import { currentBrand } from "@/lib/brand";
import { brand } from "@/content/copy";
import { cn } from "@/lib/utils";

/**
 * Latchkey's own marks: forest green squircle, cream line work, a terracotta
 * jewel. Three motifs; "key" is the default. The super admin picks the site
 * logo (site_settings.brand.logoMark / logoUrl); hosts can use the marks in
 * their own theme colours (LogoMark). The same drawings make the favicons and
 * app icons (public/brand, public/icons, public/favicon.ico).
 */
export type BrandMarkVariant = "key" | "arch" | "monogram";

export const BRAND_COLOURS = { forest: "#183b2b", cream: "#f4ecdc", terracotta: "#c8643b" } as const;

const { forest, cream, terracotta } = BRAND_COLOURS;

/** Each motif drawn on a 48×48 grid in the given colours, without the squircle behind it. */
export function markArt(variant: BrandMarkVariant, fg: string = cream, accent: string = terracotta): string {
  switch (variant) {
    // Antique mortise key: hollow bow with the jewel, collar, shaft and a stepped bit.
    case "key":
      return `<g fill="none" stroke="${fg}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="14.5" r="6.8"/><path d="M20.2 24.4h7.6M24 21.3V38"/></g><path d="M24 29.2h7.2v3.2h-2.6v4.8H24z" fill="${fg}"/><circle cx="24" cy="14.5" r="2.3" fill="${accent}"/>`;
    // Georgian portico: arched doorway with a fanlight, keyhole glowing in it.
    case "arch":
      return `<g fill="none" stroke="${fg}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 38V22.5a10.5 10.5 0 0 1 21 0V38"/><path d="M9.5 38h29"/><path d="M18.5 19.2a6.2 6.2 0 0 1 11 0" stroke-width="2"/></g><circle cx="24" cy="26.2" r="3" fill="${accent}"/><path d="M22.7 28h2.6l1 5.6h-4.6z" fill="${accent}"/>`;
    // Serif capital L whose stem rises into a key bow and whose foot ends in the bit.
    case "monogram":
      return `<circle cx="18" cy="11.6" r="4.6" fill="none" stroke="${fg}" stroke-width="2.6"/><circle cx="18" cy="11.6" r="1.6" fill="${accent}"/><path d="M15.6 16.2H20.4V31.6H32.4V28.6H34.8V36H12.6V34.2L15.6 33.4Z" fill="${fg}"/><path d="M26 35.8h3v4h-3zM30.6 35.8h2.8v2.6h-2.8z" fill="${fg}"/>`;
  }
}

export const BRAND_MARKS: Record<BrandMarkVariant, string> = { key: markArt("key"), arch: markArt("arch"), monogram: markArt("monogram") };

/** A letter on the squircle: the site logo when the super admin picks "first letter". */
export function initialIconSvg(name: string, size = 48): string {
  const letter = (name.trim()[0] ?? "L").toUpperCase().replace(/[<>&"']/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}"><rect width="48" height="48" rx="12" fill="${forest}"/><text x="24" y="32.5" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="${cream}">${letter}</text></svg>`;
}

/** The whole icon as an SVG document: squircle plus motif. `pad` (0–0.3) shrinks it for maskable icons. */
export function brandIconSvg(variant: BrandMarkVariant = "key", { pad = 0, size = 48 }: { pad?: number; size?: number } = {}): string {
  const scale = 1 - pad * 2;
  const offset = 24 * (1 - scale);
  const bg = pad > 0 ? `<rect width="48" height="48" fill="${forest}"/>` : `<rect width="48" height="48" rx="12" fill="${forest}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}">${bg}<g transform="translate(${offset} ${offset}) scale(${scale})">${BRAND_MARKS[variant]}</g></svg>`;
}

/** Just the mark. */
export function BrandMark({ variant = "key", className, title }: { variant?: BrandMarkVariant; className?: string | undefined; title?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-10 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      // Fixed drawings from this file, never user input.
      dangerouslySetInnerHTML={{ __html: `<rect width="48" height="48" rx="12" fill="${forest}"/>${BRAND_MARKS[variant]}` }}
    />
  );
}

/** The site logo the super admin chose (Latchkey admin → Brand): upload, mark or initial. */
export function SiteLogoMark({ className }: { className?: string | undefined }) {
  const b = currentBrand();
  const [broken, setBroken] = useState(false);
  if (b.logoUrl && !broken) {
    return <img src={b.logoUrl} alt="" aria-hidden onError={() => setBroken(true)} className={cn("size-10 shrink-0 rounded-2xl object-contain", className)} />;
  }
  if (b.logoMark === "initial") {
    return (
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl bg-primary font-display text-lg text-primary-foreground", className)} aria-hidden>
        {b.name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <BrandMark variant={b.logoMark} className={className} />;
}

/** The product's logo: the site logo, plus the name in the display serif unless `wordmark` is false. */
export function BrandLogo({
  wordmark = true,
  className,
  markClassName,
  nameClassName,
}: {
  wordmark?: boolean;
  className?: string;
  markClassName?: string;
  nameClassName?: string;
}) {
  const name = brand.name;
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <SiteLogoMark className={markClassName} />
      {wordmark ? <span className={cn("truncate font-display text-xl", nameClassName)}>{name}</span> : <span className="sr-only">{name}</span>}
    </span>
  );
}
