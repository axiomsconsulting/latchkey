import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, GripVertical, LogOut, Repeat, Sparkles, X } from "lucide-react";

import { demoDockCopy as copy } from "@/content/copy";
import { withAttribution } from "@/lib/attribution";
import { clampDock, defaultDock, moveDock, readDock, type DockPos } from "@/lib/demo-dock";
import { SHOWCASE, demoKeyForCode } from "@/lib/demo-showcase";
import { cn } from "@/lib/utils";

/**
 * The floating demo panel, bottom right: says it's a shared demo that resets
 * daily, and offers the ways on (switch property, start a free trial, leave).
 * Drag it by its grip anywhere on screen; fold it to a small pill. Where it
 * sits and whether it's folded are remembered in this browser. Sizes are in
 * pixels, so the kiosk's screen scaling never makes it huge.
 */
export function DemoDock({ mode, children, onLeave }: { mode: "host" | "guest"; children: ReactNode; onLeave: () => void }) {
  const key = `lk_demo_dock_${mode}`;
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<DockPos | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Where it was left (read after hydration: the server can't know).
  useEffect(() => {
    let saved = { pos: null as DockPos | null, collapsed: false };
    try {
      saved = readDock(window.localStorage.getItem(key));
    } catch {
      // Storage blocked: the default corner.
    }
    setCollapsed(saved.collapsed);
    setPos(saved.pos ?? defaultDock(window.innerWidth, mode));
  }, [key, mode]);

  const remember = (p: DockPos, c: boolean) => {
    try {
      window.localStorage.setItem(key, JSON.stringify({ ...p, collapsed: c }));
    } catch {
      // Not remembered this time.
    }
  };

  // Keep it on screen when the window (or a phone's toolbar) changes size.
  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const next = clampDock(pos, { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight });
      if (next.right !== pos.right || next.bottom !== pos.bottom) setPos(next);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [pos, collapsed]);

  function startDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pos || !ref.current) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const start = pos;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const size = { w: ref.current.offsetWidth, h: ref.current.offsetHeight };
    let last = start;
    const move = (ev: PointerEvent) => {
      last = clampDock(moveDock(start, ev.clientX - x0, ev.clientY - y0), size, { w: window.innerWidth, h: window.innerHeight });
      setPos(last);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      remember(last, collapsed);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  const toggle = (c: boolean) => {
    setCollapsed(c);
    if (pos) remember(pos, c);
  };

  if (!pos) return null;
  return (
    <div
      ref={ref}
      role="region"
      aria-label={copy.label}
      style={{ right: pos.right, bottom: pos.bottom, fontSize: 14 }}
      className="fixed z-[60] select-none print:hidden"
    >
      {collapsed ? (
        <div className="flex items-center rounded-full bg-foreground/90 text-background shadow-lifted backdrop-blur">
          <button type="button" aria-label={copy.move} title={copy.move} onPointerDown={startDrag} className="grid h-[40px] w-[28px] cursor-grab touch-none place-items-center rounded-l-full active:cursor-grabbing">
            <GripVertical className="size-[16px]" />
          </button>
          <button type="button" onClick={() => toggle(false)} className="h-[40px] pr-[14px] text-[13px] font-semibold" aria-expanded={false}>
            {copy.pill}
          </button>
        </div>
      ) : (
        <div className="w-[300px] max-w-[calc(100vw-16px)] overflow-hidden rounded-[20px] border border-border bg-background/95 text-foreground shadow-lifted backdrop-blur">
          <div className="flex items-center gap-[4px] border-b border-border bg-secondary/60 px-[6px] py-[4px]">
            <button type="button" aria-label={copy.move} title={copy.move} onPointerDown={startDrag} className="grid h-[32px] w-[28px] cursor-grab touch-none place-items-center rounded-lg text-muted-foreground active:cursor-grabbing">
              <GripVertical className="size-[16px]" />
            </button>
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{mode === "host" ? copy.hostTitle : copy.guestTitle}</span>
            <button type="button" aria-label={copy.collapse} title={copy.collapse} onClick={() => toggle(true)} className="grid size-[32px] place-items-center rounded-lg text-muted-foreground hover:bg-background">
              <ChevronDown className="size-[16px]" />
            </button>
          </div>
          <div className="space-y-[10px] p-[12px]">
            <p className="text-[13px] leading-snug text-muted-foreground">{copy.text}</p>
            {children}
            <div className="flex flex-wrap gap-[8px]">
              <a href={withAttribution("/start")} className="inline-flex h-[36px] items-center gap-[6px] rounded-full bg-accent px-[14px] text-[13px] font-semibold text-accent-foreground">
                <Sparkles className="size-[14px]" /> {copy.trial}
              </a>
              <button type="button" onClick={onLeave} className="inline-flex h-[36px] items-center gap-[6px] rounded-full border border-border px-[12px] text-[13px] font-medium hover:bg-secondary">
                {mode === "host" ? <LogOut className="size-[14px]" /> : <X className="size-[14px]" />} {mode === "host" ? copy.leaveHost : copy.leaveGuest}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The guest demo's "switch property experience": starts the guest journey again at the chosen property. */
export function GuestDemoSwitch({ current }: { current: string }) {
  const options = [{ key: "hill", label: copy.hill, path: "/tour" }, ...SHOWCASE.map((s) => ({ key: s.key, label: `${s.property.name} · ${s.label}`, path: `/tour/${s.key}` }))];
  return (
    <label className="block space-y-[4px]">
      <span className="flex items-center gap-[6px] text-[12px] font-medium"><Repeat className="size-[14px]" /> {copy.switchGuest}</span>
      <select
        className="h-[36px] w-full rounded-xl border border-border bg-surface px-[8px] text-[13px]"
        value={current}
        onChange={(e) => {
          const o = options.find((x) => x.key === e.target.value);
          // A full page load: the guest journey starts again from the welcome screen.
          if (o) window.location.assign(withAttribution(o.path));
        }}
      >
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** The host demo's property switcher. */
export function HostDemoSwitch({ properties, value, onChange }: { properties: Array<{ id: string; name: string }>; value: string | null; onChange: (id: string) => void }) {
  if (properties.length < 2) return null;
  return (
    <label className="block space-y-[4px]">
      <span className="flex items-center gap-[6px] text-[12px] font-medium"><Repeat className="size-[14px]" /> {copy.switchHost}</span>
      <select className={cn("h-[36px] w-full rounded-xl border border-border bg-surface px-[8px] text-[13px]")} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}

/** The guest demo's panel, on the kiosk tour and the pages it leads to (stay and room guides of a demo property). */
export function GuestDemoDock({ code }: { code: string | null | undefined }) {
  const key = demoKeyForCode(code);
  if (!key) return null;
  return (
    <DemoDock mode="guest" onLeave={() => window.location.assign("/?home=1")}>
      <GuestDemoSwitch current={key} />
    </DemoDock>
  );
}

