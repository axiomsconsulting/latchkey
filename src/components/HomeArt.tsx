import { useSite } from "@/hooks/use-site";
import { artFor, DEFAULT_HOME_ART, type HomeArtSlot } from "@/lib/home-art";
import { cn } from "@/lib/utils";

/**
 * The super admin's pictures for one place on the home page (src/lib/home-art.ts).
 * By the headline: one picture beside the words and buttons under it (its
 * own column, so never behind text), from laptop width up. By a section: in the empty margin beside it, on very
 * wide screens only, so a picture never sits behind text. Decoration only:
 * hidden from screen readers and never in the way of a click.
 */
export function HomeArt({ slot }: { slot: HomeArtSlot }) {
  // No site settings to hand (offline, or not read yet): Latchkey's own pictures.
  const items = artFor(useSite()?.homeArt ?? DEFAULT_HOME_ART, slot);
  if (!items.length) return null;
  if (slot === "hero") {
    const a = items[0]!;
    return (
      <img
        src={a.src}
        alt=""
        aria-hidden
        decoding="async"
        style={{ "--art-opacity": a.opacity } as React.CSSProperties}
        className={cn(
          "pointer-events-none hidden max-h-[22rem] w-[32%] shrink-0 select-none object-contain object-bottom opacity-[var(--art-opacity)] lg:block dark:opacity-[calc(var(--art-opacity)*0.55)]",
          a.side === "left" && "lg:order-first",
        )}
      />
    );
  }
  return (
    <>
      {items.map((a, i) => (
        <img
          key={a.id}
          src={a.src}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          style={{ "--art-opacity": a.opacity, top: `${50 + i * 8}%` } as React.CSSProperties}
          className={cn(
            // Sits in the page margin: shown only where there's room beside the 72rem content.
            "pointer-events-none absolute hidden max-h-72 w-[min(17rem,calc((100vw-72rem)/2-4rem))] -translate-y-1/2 select-none object-contain opacity-[var(--art-opacity)] min-[1600px]:block dark:opacity-[calc(var(--art-opacity)*0.55)]",
            a.side === "left" ? "right-full mr-12" : "left-full ml-12",
          )}
        />
      ))}
    </>
  );
}
