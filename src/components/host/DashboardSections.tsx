import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useUi } from "@/hooks/use-site";
import { arrange } from "@/lib/ui-config";
import { ChevronDown } from "lucide-react";

import { dashboardCopy as copy } from "@/content/copy";
import { readLayout, toggleCollapsed, type Layout } from "@/lib/dashboard-layout";
import { moveItem } from "@/lib/reorder";
import { cn } from "@/lib/utils";

type Ctx = {
  collapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  grabProps: (id: string, title: string) => React.ButtonHTMLAttributes<HTMLButtonElement>;
  dragging: string | null;
};

const SectionsContext = createContext<Ctx | null>(null);

/**
 * Today's sections, which the host can move and fold. The same grab bar as
 * the menu: drag it to move a section, tap it to fold or unfold, or use the
 * arrow keys (and Enter to fold). Remembered in this browser.
 */
export function DashboardSections({
  storageKey,
  items: all,
  page,
}: {
  storageKey: string;
  items: Array<{ id: string; wide?: boolean; node: ReactNode }>;
  /** The super admin's layout for this page (src/lib/ui-config.ts): their order is the starting order, hidden sections never show. */
  page?: string;
}) {
  const ui = useUi();
  const allowed = page ? arrange(ui.pages[page], all.map((i) => i.id)) : all.map((i) => i.id);
  const items = allowed.map((id) => all.find((i) => i.id === id)!).filter(Boolean);
  const defaults = items.map((i) => i.id);
  const [layout, setLayoutState] = useState<Layout>({ order: defaults, collapsed: [] });
  const [dragging, setDragging] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean; order: string[] } | null>(null);

  useEffect(() => {
    try {
      setLayoutState(readLayout(window.localStorage.getItem(storageKey), defaults));
    } catch {
      setLayoutState(readLayout(null, defaults));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, defaults.join()]);

  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(l));
    } catch {
      // Not remembered this time.
    }
  };
  const toggle = (id: string) => setLayout(toggleCollapsed(layout, id));
  const move = (id: string, by: -1 | 1) => {
    const from = layout.order.indexOf(id);
    const next = moveItem(layout.order, from, from + by);
    if (next !== layout.order) setLayout({ ...layout, order: next });
  };

  const grabProps = (id: string, title: string): React.ButtonHTMLAttributes<HTMLButtonElement> => ({
    type: "button",
    "aria-label": copy.grab(title, layout.collapsed.includes(id)),
    title: copy.grabHint,
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id, x: e.clientX, y: e.clientY, moved: false, order: layout.order };
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) {
        d.moved = true;
        setDragging(id);
      }
      if (!d.moved) return;
      // Whichever section is under the pointer takes this one's place.
      const over = [...(listRef.current?.querySelectorAll<HTMLLIElement>("li[data-section]") ?? [])].find((li) => {
        const b = li.getBoundingClientRect();
        return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
      });
      const target = over?.dataset["section"];
      if (target && target !== id) {
        d.order = moveItem(d.order, d.order.indexOf(id), d.order.indexOf(target));
        setLayoutState((l) => ({ ...l, order: d.order }));
      }
    },
    onPointerUp: () => {
      const d = drag.current;
      drag.current = null;
      setDragging(null);
      if (!d) return;
      // A tap folds or unfolds, like the menu's grab bar changes the menu.
      if (!d.moved) return toggle(id);
      setLayout({ ...layout, order: d.order });
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragging(null);
    },
    onKeyDown: (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        move(id, -1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        move(id, 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(id);
      }
    },
  });

  const byId = new Map(items.map((i) => [i.id, i]));
  const changed = layout.order.join() !== defaults.join() || layout.collapsed.length > 0;
  return (
    <SectionsContext.Provider value={{ collapsed: (id) => layout.collapsed.includes(id), toggle, grabProps, dragging }}>
      <ul ref={listRef} className="grid items-start gap-5 pt-2 lg:grid-cols-2">
        {layout.order.map((id) => {
          const item = byId.get(id);
          if (!item || item.node === null || item.node === false) return null;
          return (
            <li key={id} data-section={id} className={cn("min-w-0", item.wide && "lg:col-span-2", dragging === id && "opacity-80")}>
              {item.node}
            </li>
          );
        })}
      </ul>
      {changed ? (
        <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setLayout({ order: defaults, collapsed: [] })}>
          {copy.reset}
        </button>
      ) : null}
    </SectionsContext.Provider>
  );
}

/**
 * One of Today's sections: a card with the menu's grab bar on its top edge
 * and a fold button. Outside DashboardSections it's a plain card.
 */
export function DashSection({
  id,
  icon: Icon,
  title,
  action,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const ctx = useContext(SectionsContext);
  const folded = ctx?.collapsed(id) ?? false;
  return (
    <section id={`today-${id}`} className={cn("card-soft relative flex flex-col p-5 scroll-mt-24", ctx?.dragging === id && "shadow-lifted ring-2 ring-primary/40")}>
      {ctx ? (
        <button
          {...ctx.grabProps(id, title)}
          className="group absolute -top-2 left-1/2 grid h-4 w-20 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <span className="h-1 w-12 rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
        </button>
      ) : null}
      <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", !folded && "mb-3")}>
        <Icon className="size-5 shrink-0 text-primary" />
        <h2 className="mr-auto text-lg">{title}</h2>
        {action ? <span className="text-sm">{action}</span> : null}
        {ctx ? (
          <button
            type="button"
            onClick={() => ctx.toggle(id)}
            aria-expanded={!folded}
            aria-label={folded ? copy.unfold(title) : copy.fold(title)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <ChevronDown className={cn("size-4 transition-transform", folded && "-rotate-90")} />
          </button>
        ) : null}
      </div>
      {folded ? null : children}
    </section>
  );
}
