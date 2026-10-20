import { DEFAULT_NAME } from "@/lib/brand";
import { brand } from "@/content/copy";
import { cn } from "@/lib/utils";

/**
 * Latchkey's own mark: forest green squircle, cream line work, a terracotta
 * jewel. Three motifs; "key" is the primary. The same drawings make the
 * favicons and app icons (public/brand/*.svg, public/icons, public/favicon.ico).
 */
export type BrandMarkVariant = "key" | "arch" | "monogram";

export const BRAND_COLOURS = { forest: "#183b2b", cream: "#f4ecdc", terracotta: "#c8643b" } as const;

const { forest, cream, terracotta } = BRAND_COLOURS;

/** Each motif drawn on a 48×48 grid, without the squircle behind it. */
export const BRAND_MARKS: Record<BrandMarkVariant, string> = {
  // Antique mortise key: hollow bow with the jewel, collar, shaft and a stepped bit.
  key: `<g fill="none" stroke="${cream}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="14.5" r="6.8"/><path d="M20.2 24.4h7.6M24 21.3V38"/></g><path d="M24 29.2h7.2v3.2h-2.6v4.8H24z" fill="${cream}"/><circle cx="24" cy="14.5" r="2.3" fill="${terracotta}"/>`,
  // Georgian portico: arched doorway with a fanlight, keyhole glowing in it.
  arch: `<g fill="none" stroke="${cream}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 38V22.5a10.5 10.5 0 0 1 21 0V38"/><path d="M9.5 38h29"/><path d="M18.5 19.2a6.2 6.2 0 0 1 11 0" stroke-width="2"/></g><circle cx="24" cy="26.2" r="3" fill="${terracotta}"/><path d="M22.7 28h2.6l1 5.6h-4.6z" fill="${terracotta}"/>`,
  // Serif capital L whose stem rises into a key bow and whose foot ends in the bit.
  monogram: `<circle cx="18" cy="11.6" r="4.6" fill="none" stroke="${cream}" stroke-width="2.6"/><circle cx="18" cy="11.6" r="1.6" fill="${terracotta}"/><path d="M15.6 16.2H20.4V31.6H32.4V28.6H34.8V36H12.6V34.2L15.6 33.4Z" fill="${cream}"/><path d="M26 35.8h3v4h-3zM30.6 35.8h2.8v2.6h-2.8z" fill="${cream}"/>`,
};

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

/**
 * The product's logo: mark, plus the name in the display serif unless `wordmark` is false.
 * Under another brand name (white label) it falls back to that name's initial,
 * so Latchkey's key never shows on someone else's product.
 */
export function BrandLogo({
  variant = "key",
  wordmark = true,
  className,
  markClassName,
  nameClassName,
}: {
  variant?: BrandMarkVariant;
  wordmark?: boolean;
  className?: string;
  markClassName?: string;
  nameClassName?: string;
}) {
  const name = brand.name;
  const own = name === DEFAULT_NAME;
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      {own ? (
        <BrandMark variant={variant} className={markClassName} />
      ) : (
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl bg-primary font-display text-lg text-primary-foreground", markClassName)} aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {wordmark ? <span className={cn("truncate font-display text-xl", nameClassName)}>{name}</span> : <span className="sr-only">{name}</span>}
    </span>
  );
}
