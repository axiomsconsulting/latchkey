import { useCallback, useEffect, useRef, useState } from "react";

import { RAIL_HIDE_MS, RAIL_WINDOW, activeSection, railStart } from "@/lib/section-rail";
import { cn } from "@/lib/utils";

type Item = { id: string; label: string; group: string };

const ROW = 2.25; // rem per name

/**
 * A see-through list of a long page's sections down the right-hand edge. It
 * slides in while the page scrolls, shows up to five names around the one
 * being read (the rest fade out above and below), and slides away soon after
 * scrolling stops. Tapping a name jumps there. Reads the page's blocks from
 * [data-rail] (PageSections with `rail`), in page order, skipping empty ones.
 */
export function SectionRail({ label }: { label: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(false);
  const hover = useRef(false);
  const timer = useRef<number | null>(null);

  const read = useCallback(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-rail]")].filter((el) => el.offsetHeight > 0);
    setItems(els.map((el) => ({ id: el.id, label: el.dataset["railLabel"] ?? "", group: el.dataset["railGroup"] ?? "" })));
    setActive(activeSection(els.map((el) => el.getBoundingClientRect().top), window.innerHeight / 3));
  }, []);

  useEffect(() => {
    read();
    // Sections load and fold open as data arrives: keep the list in step.
    const mo = new MutationObserver(() => read());
    const main = document.querySelector("[data-host-main]") ?? document.body;
    mo.observe(main, { childList: true, subtree: true });
    const hideSoon = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => !hover.current && setShown(false), RAIL_HIDE_MS);
    };
    const onScroll = () => {
      read();
      setShown(true);
      hideSoon();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      mo.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", read);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [read]);

  if (items.length < 3) return null;
  const start = railStart(active, items.length);
  const size = Math.min(RAIL_WINDOW, items.length);

  return (
    <nav
      aria-label={label}
      onPointerEnter={() => {
        hover.current = true;
        setShown(true);
      }}
      onPointerLeave={() => {
        hover.current = false;
        timer.current = window.setTimeout(() => setShown(false), RAIL_HIDE_MS);
      }}
      onFocus={() => setShown(true)}
      className={cn(
        "fixed right-0 top-1/2 z-30 -translate-y-1/2 pr-2 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none print:hidden",
        shown ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[110%] opacity-0",
      )}
    >
      <div className="glass rounded-2xl py-2 pl-3 pr-2 shadow-soft">
        <p className="px-1 pb-1 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {active + 1} / {items.length}
        </p>
        {/* Five rows in view; the list slides so the current one sits in the middle, and the ends fade. */}
        <div
          className="relative overflow-hidden"
          style={{
            height: `${size * ROW}rem`,
            maskImage: items.length > RAIL_WINDOW ? "linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)" : undefined,
            WebkitMaskImage: items.length > RAIL_WINDOW ? "linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)" : undefined,
          }}
        >
          <ol className="transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `translateY(-${start * ROW}rem)` }}>
            {items.map((it, i) => (
              <li key={it.id} style={{ height: `${ROW}rem` }}>
                <button
                  type="button"
                  tabIndex={shown ? 0 : -1}
                  aria-current={i === active ? "true" : undefined}
                  onClick={() => document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className={cn(
                    "flex h-full w-full max-w-[11rem] items-center justify-end gap-2 rounded-lg px-1 text-right text-xs leading-tight hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    i === active ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="min-w-0">
                    {it.group && it.group !== items[i - 1]?.group ? <span className="block truncate text-[9px] font-medium uppercase tracking-wider text-accent">{it.group}</span> : null}
                    <span className="block truncate">{it.label}</span>
                  </span>
                  <span aria-hidden className={cn("h-4 w-1 shrink-0 rounded-full", i === active ? "bg-primary" : "bg-border")} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </nav>
  );
}
