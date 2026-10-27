import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Building2, ChevronLeft, ChevronRight, LogOut, Sparkles, X } from "lucide-react";

import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { demoDockCopy as copy } from "@/content/copy";
import { withAttribution } from "@/lib/attribution";
import {
  clampBottom,
  defaultDock,
  dropDock,
  isDrag,
  readDock,
  type DockPos,
} from "@/lib/demo-dock";
import { SHOWCASE, demoKeyForCode } from "@/lib/demo-showcase";
import { normaliseTheme, type ThemeConfig } from "@/lib/theme";
import { coverFor } from "@/lib/theme-covers";
import { cn } from "@/lib/utils";

/**
 * The demo panel: a small tab stuck to the side of the screen (bottom right
 * to start) that says it's a demo and switches property. Tap it to open the
 * panel beside it; picking a property, tapping outside or Escape folds it
 * away again. Drag the tab anywhere and it sticks to the nearer side, at that
 * height, remembered in this browser. Sizes are in pixels, so the kiosk's
 * screen scaling never makes it huge.
 */
export function DemoDock({
  mode,
  children,
  onLeave,
}: {
  mode: "host" | "guest";
  children: (done: () => void) => ReactNode;
  onLeave: () => void;
}) {
  const key = `lk_demo_dock_${mode}`;
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<DockPos | null>(null);
  const [open, setOpen] = useState(false);
  // While dragging: where the tab is, following the pointer.
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  // Where it was left (read after hydration: the server can't know).
  useEffect(() => {
    let saved: DockPos | null = null;
    try {
      saved = readDock(window.localStorage.getItem(key));
    } catch {
      // Storage blocked: the default corner.
    }
    setPos(saved ?? defaultDock(window.innerWidth, mode));
  }, [key, mode]);

  const remember = (p: DockPos) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(p));
    } catch {
      // Not remembered this time.
    }
  };

  // Keep it (and the open panel) on screen when the window or a phone's toolbar changes size.
  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const bottom = clampBottom(pos.bottom, el.offsetHeight, window.innerHeight);
      if (bottom !== pos.bottom) setPos({ ...pos, bottom });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [pos, open]);

  // Open: a tap anywhere else, or Escape, folds it away.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // One handle for both: a tap opens or closes, a drag moves it.
  function press(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pos) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const tabHeight = handle.offsetHeight;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && !isDrag(ev.clientX - x0, ev.clientY - y0)) return;
      if (!moved) setOpen(false);
      moved = true;
      setDrag({ x: ev.clientX, y: ev.clientY });
    };
    const end = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDrag(null);
      if (!moved) {
        if (ev.type === "pointerup") setOpen((o) => !o);
        return;
      }
      const next = dropDock({ x: ev.clientX, y: ev.clientY }, tabHeight, {
        w: window.innerWidth,
        h: window.innerHeight,
      });
      setPos(next);
      remember(next);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  if (!pos) return null;
  const right = pos.side === "right";
  const Chevron = open === right ? ChevronRight : ChevronLeft;
  const tab = (
    <button
      type="button"
      onPointerDown={press}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
      aria-expanded={open}
      aria-label={copy.tab}
      title={copy.tabHint}
      className={cn(
        "flex w-[40px] shrink-0 cursor-grab touch-none flex-col items-center justify-center gap-[3px] bg-foreground/90 py-[10px] text-background shadow-lifted backdrop-blur active:cursor-grabbing",
        right ? "rounded-l-[14px]" : "rounded-r-[14px]",
      )}
    >
      <Building2 className="size-[18px]" />
      <span className="text-[10px] font-bold uppercase tracking-[0.08em]">{copy.pill}</span>
      <Chevron className="size-[14px] opacity-70" />
    </button>
  );

  return (
    <div
      ref={ref}
      role="region"
      aria-label={copy.label}
      style={
        drag
          ? { left: drag.x - 20, top: drag.y - 32, fontSize: 14 }
          : { [right ? "right" : "left"]: 0, bottom: pos.bottom, fontSize: 14 }
      }
      className={cn(
        "fixed z-[60] flex select-none items-end print:hidden",
        right ? "flex-row" : "flex-row-reverse",
      )}
    >
      {tab}
      {open && !drag ? (
        <div
          className={cn(
            "max-h-[calc(100dvh-16px)] w-[min(340px,calc(100vw-48px))] overflow-y-auto border border-border bg-background/95 text-foreground shadow-lifted backdrop-blur animate-in fade-in",
            right
              ? "rounded-l-[18px] border-r-0 slide-in-from-right-4"
              : "rounded-r-[18px] border-l-0 slide-in-from-left-4",
          )}
        >
          <div className="space-y-[10px] p-[12px]">
            <p className="flex items-start gap-[6px] text-[12px] leading-snug text-muted-foreground">
              <span className="mt-[1px] shrink-0 rounded-full bg-accent px-[6px] text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
                {copy.pill}
              </span>
              {copy.text}
            </p>
            {children(() => setOpen(false))}
            <div className="flex flex-wrap gap-[8px] border-t border-border pt-[10px]">
              <a
                href={withAttribution("/start")}
                className="inline-flex h-[36px] items-center gap-[6px] rounded-full bg-accent px-[14px] text-[13px] font-semibold text-accent-foreground"
              >
                <Sparkles className="size-[14px]" /> {copy.trial}
              </a>
              <button
                type="button"
                onClick={onLeave}
                className="inline-flex h-[36px] items-center gap-[6px] rounded-full border border-border px-[12px] text-[13px] font-medium hover:bg-secondary"
              >
                {mode === "host" ? (
                  <LogOut className="size-[14px]" />
                ) : (
                  <X className="size-[14px]" />
                )}{" "}
                {mode === "host" ? copy.leaveHost : copy.leaveGuest}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Choice = { key: string; name: string; place: string; theme: ThemeConfig };

/** The property choices as small previews of each one's look: cover, logo, name, buttons and colours. */
function ThemeChoices({
  label,
  choices,
  current,
  onPick,
}: {
  label: string;
  choices: Choice[];
  current: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <div className="space-y-[6px]">
      <p className="text-[12px] font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-[8px]">
        {choices.map((c) => (
          <ThemeCard
            key={c.key}
            choice={c}
            active={c.key === current}
            onPick={() => onPick(c.key)}
          />
        ))}
      </div>
    </div>
  );
}

function ThemeCard({
  choice,
  active,
  onPick,
}: {
  choice: Choice;
  active: boolean;
  onPick: () => void;
}) {
  const { theme, name, place } = choice;
  const cover = coverFor(theme);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onPick}
      className={cn(
        "overflow-hidden rounded-[14px] border text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-foreground ring-2 ring-foreground" : "border-border hover:shadow-soft",
      )}
    >
      <ThemeScope theme={theme} full className="block">
        <span className="relative block h-[54px] bg-primary">
          {cover ? (
            <img
              src={cover}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
          <LogoMark
            theme={theme}
            name={name}
            className="absolute -bottom-[12px] left-[8px] size-[28px] rounded-[8px] border-2 border-background text-[12px]"
          />
        </span>
        <span className="block px-[8px] pb-[8px] pt-[16px]">
          <span className="block truncate font-display text-[13px] leading-tight">{name}</span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            {place}
          </span>
          {/* The look in miniature: its main button, an outline button and the accent. */}
          <span aria-hidden className="mt-[7px] flex items-center gap-[4px]">
            <span className="h-[12px] flex-1 rounded-[var(--radius-button,6px)] bg-primary" />
            <span className="h-[12px] w-[22px] rounded-[var(--radius-button,6px)] border border-primary" />
            <span className="size-[12px] shrink-0 rounded-full bg-accent" />
          </span>
        </span>
      </ThemeScope>
    </button>
  );
}

/** The guest demo's property switch: starts the guest journey again at the chosen property. */
export function GuestDemoSwitch({ current, done }: { current: string; done: () => void }) {
  const choices: Array<Choice & { path: string }> = [
    {
      key: "hill",
      name: copy.hillName,
      place: copy.hillPlace,
      theme: normaliseTheme({}),
      path: "/tour",
    },
    ...SHOWCASE.map((s) => ({
      key: s.key,
      name: s.property.name,
      place: `${s.label} · ${s.themeName}`,
      theme: normaliseTheme(s.theme),
      path: `/tour/${s.key}`,
    })),
  ];
  return (
    <ThemeChoices
      label={copy.switchGuest}
      choices={choices}
      current={current}
      onPick={(key) => {
        done();
        const c = choices.find((x) => x.key === key);
        // A full page load: the guest journey starts again from the welcome screen.
        if (c && key !== current) window.location.assign(withAttribution(c.path));
      }}
    />
  );
}

/** The host demo's property switch. */
export function HostDemoSwitch({
  properties,
  value,
  onChange,
  done,
}: {
  properties: Array<{ id: string; name: string; theme_config: unknown }>;
  value: string | null;
  onChange: (id: string) => void;
  done: () => void;
}) {
  if (properties.length < 2) return null;
  const choices = properties.map((p) => {
    const theme = normaliseTheme(p.theme_config);
    return { key: p.id, name: p.name, place: theme.subname || theme.tagline, theme };
  });
  return (
    <ThemeChoices
      label={copy.switchHost}
      choices={choices}
      current={value}
      onPick={(id) => {
        done();
        if (id !== value) onChange(id);
      }}
    />
  );
}

/** The guest demo's panel, on the kiosk tour and the pages it leads to (stay and room guides of a demo property). */
export function GuestDemoDock({ code }: { code: string | null | undefined }) {
  const key = demoKeyForCode(code);
  if (!key) return null;
  return (
    <DemoDock mode="guest" onLeave={() => window.location.assign("/?home=1")}>
      {(done) => <GuestDemoSwitch current={key} done={done} />}
    </DemoDock>
  );
}
