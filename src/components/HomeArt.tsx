import { useSite } from "@/hooks/use-site";
import { artFor, DEFAULT_HOME_ART, DEFAULT_HOME_ART_STYLE, type HomeArtItem, type HomeArtSlot, type HomeArtStyle } from "@/lib/home-art";

/**
 * The super admin's photo for one place on the home page (src/lib/home-art.ts),
 * as a faint full-width background behind the headline or a section: the
 * photo at the chosen transparency, greyed and tinted, washed with the page's
 * own colour (dimming) and fading out at the top and bottom so sections run
 * into each other. Drawn behind everything (the page is `isolate`), never
 * in the way of a click, hidden from screen readers.
 */
export function HomeArt({ slot }: { slot: HomeArtSlot }) {
  const site = useSite();
  const items = artFor(site?.homeArt ?? DEFAULT_HOME_ART, slot);
  if (!items.length) return null;
  return <ArtBackdrop item={items[0]!} style={site?.homeArtStyle ?? DEFAULT_HOME_ART_STYLE} />;
}

/** One faint full-width photo; also the Latchkey admin's preview. */
export function ArtBackdrop({ item, style, contained = false }: { item: Pick<HomeArtItem, "src" | "side" | "opacity">; style: HomeArtStyle; contained?: boolean }) {
  return (
    <div
      aria-hidden
      className={
        contained
          ? "pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          : // Full width of the window whatever the column, a little above and below the block.
            "pointer-events-none absolute -inset-y-8 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]"
      }
    >
      {/* The photo and its tint in their own layer, so the tint colours only the photo; then the layer is made faint. */}
      <div className="absolute inset-0 isolate" style={{ opacity: style.opacity * item.opacity }}>
        <img
          src={item.src}
          alt=""
          decoding="async"
          loading="lazy"
          className="size-full select-none object-cover"
          style={{ objectPosition: item.side === "left" ? "left center" : item.side === "right" ? "right center" : "center", filter: `grayscale(${style.grey})` }}
        />
        {style.tint && style.tintStrength > 0 ? <div className="absolute inset-0" style={{ background: style.tint, opacity: style.tintStrength, mixBlendMode: "color" }} /> : null}
      </div>
      {/* Dimming: a wash of the page's own background colour. */}
      {style.dim > 0 ? <div className="absolute inset-0 bg-background" style={{ opacity: style.dim }} /> : null}
    </div>
  );
}
