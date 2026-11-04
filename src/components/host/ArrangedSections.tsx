import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
} from "lucide-react";

import { arrangeCopy as copy } from "@/content/copy";
import {
  arrangeSections,
  dropSection,
  moveSection,
  readLayout,
  toggleOpen,
  type SectionLayout,
} from "@/lib/section-layout";
import { cn } from "@/lib/utils";

export type ArrangedItem = { id: string; title: string; hint?: string; node: ReactNode };

/**
 * A page of settings as a short list: one line per section, opened by a tap, and
 * moved with the arrows or by dragging. Each person's arrangement stays on their
 * device. A section stays mounted once opened, so folding one never loses what's
 * been typed into it.
 */
export function ArrangedSections({
  storageKey,
  items,
  allIds,
  focus,
}: {
  storageKey: string;
  items: ArrangedItem[];
  /** Every section on the page, for sections on other tabs to keep their place. */
  allIds?: string[];
  /** Opened by a link that landed here. */
  focus?: string | null | undefined;
}) {
  const [layout, setLayout] = useState<SectionLayout>({ order: [], open: [] });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      setLayout(readLayout(window.localStorage.getItem(storageKey)));
    } catch {
      // Private window: it just won't be remembered.
    }
    setLoaded(true);
  }, [storageKey]);
  const save = (next: SectionLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // As above.
    }
  };
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const everyId = allIds ?? ids;
  const order = arrangeSections(layout.order, everyId);
  const visible = order.filter((id) => ids.includes(id));
  // A page with one section has nothing to fold away.
  const opened = (id: string) => ids.length === 1 || layout.open.includes(id);

  // Arriving from a link opens that section, for good.
  useEffect(() => {
    if (!focus || !loaded || !ids.includes(focus) || layout.open.includes(focus)) return;
    save({ ...layout, open: [...layout.open, focus] });
    // Only when a link lands here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, loaded]);

  const seen = useRef(new Set<string>());
  const dragging = useRef<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const allOpen = visible.every(opened);

  return (
    <div className="space-y-2">
      {visible.length > 1 ? (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={allOpen}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50 disabled:hover:no-underline"
            onClick={() => save({ ...layout, open: [...new Set([...layout.open, ...ids])] })}
          >
            <ChevronsUpDown className="size-3.5" aria-hidden /> {copy.openAll}
          </button>
          <button
            type="button"
            disabled={!visible.some(opened)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50 disabled:hover:no-underline"
            onClick={() => save({ ...layout, open: layout.open.filter((x) => !ids.includes(x)) })}
          >
            <ChevronsDownUp className="size-3.5" aria-hidden /> {copy.closeAll}
          </button>
        </div>
      ) : null}
      {visible.map((id, i) => {
        const item = items.find((x) => x.id === id)!;
        const open = opened(id);
        if (open) seen.current.add(id);
        return (
          <div
            key={id}
            id={`section-${id}`}
            className="scroll-mt-24 space-y-2"
            draggable={handle === id}
            onDragStart={() => {
              dragging.current = id;
            }}
            onDragEnd={() => {
              dragging.current = null;
              setHandle(null);
            }}
            onDragOver={(e) => {
              if (dragging.current) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging.current)
                save({ ...layout, order: dropSection(order, dragging.current, id) });
            }}
          >
            {ids.length > 1 ? (
              <div className="card-soft flex items-center gap-1 px-2 py-1.5">
                <span
                  className="hidden cursor-grab touch-none text-muted-foreground sm:block"
                  aria-hidden
                  onPointerDown={() => setHandle(id)}
                  onPointerUp={() => setHandle(null)}
                >
                  <GripVertical className="size-4" />
                </span>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => save({ ...layout, open: toggleOpen(layout.open, id) })}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-180",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block font-medium leading-tight">{item.title}</span>
                    {item.hint ? (
                      <span className="block text-xs text-muted-foreground">{item.hint}</span>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={i === 0}
                  aria-label={copy.up(item.title)}
                  onClick={() => save({ ...layout, order: moveSection(order, id, -1, ids) })}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-30"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={i === visible.length - 1}
                  aria-label={copy.down(item.title)}
                  onClick={() => save({ ...layout, order: moveSection(order, id, 1, ids) })}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-30"
                >
                  <ArrowDown className="size-4" />
                </button>
              </div>
            ) : null}
            {seen.current.has(id) ? <div hidden={!open}>{item.node}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
