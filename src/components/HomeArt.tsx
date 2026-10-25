import { useSite } from "@/hooks/use-site";
import { artFor, DEFAULT_HOME_ART, isPhoto, type HomeArtSlot } from "@/lib/home-art";
import { cn } from "@/lib/utils";

/**
 * The super admin's pictures for one place on the home page (src/lib/home-art.ts).
 * By the headline: one picture in its own column beside the words (laptop width up;
 * on phones and tablets a wide photo under them). By a section: in the empty margin
 * beside it on very wide screens only, never behind text. Photos are framed
 * (rounded, soft shadow); illustrations float. Decoration only.
 */
export function HomeArt({ slot }: { slot: HomeArtSlot }) {
  const items = artFor(useSite()?.homeArt ?? DEFAULT_HOME_ART, slot);
  if (!items.length) return null;
  if (slot === "hero") {
    const a = items[0]!;
    const photo = isPhoto(a.src);
    return (
      <img
        src={a.src}
        alt=""
        aria-hidden
        decoding="async"
        fetchPriority="high"
        style={{ "--art-opacity": a.opacity } as React.CSSProperties}
        className={cn(
          "pointer-events-none shrink-0 select-none opacity-[var(--art-opacity)]",
          photo
            ? "mt-8 aspect-[4/3] w-full rounded-3xl object-cover shadow-xl ring-1 ring-border lg:mt-0 lg:aspect-[4/5] lg:w-[38%] lg:self-center"
            : "hidden max-h-[22rem] w-[32%] object-contain object-bottom lg:block",
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
            "pointer-events-none absolute hidden w-[min(17rem,calc((100vw-72rem)/2-4rem))] -translate-y-1/2 select-none opacity-[var(--art-opacity)] min-[1600px]:block",
            isPhoto(a.src) ? "aspect-[4/5] rounded-3xl object-cover shadow-lg ring-1 ring-border" : "max-h-72 object-contain",
            a.side === "left" ? "right-full mr-12" : "left-full ml-12",
          )}
        />
      ))}
    </>
  );
}
