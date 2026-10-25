import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarHeart,
  CalendarSync,
  ChartLine,
  Check,
  CircleCheck,
  Compass,
  DoorOpen,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  MousePointerClick,
  ShoppingBasket,
  SprayCan,
  Wrench,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { tourCopy as copy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import {
  EMPTY_PROGRESS,
  JOURNEYS,
  coverage,
  moveStep,
  nextJourney,
  readProgress,
  selectorFor,
  startJourney,
  stepsFor,
  type Journey,
  type TourMode,
  type TourProgress,
  type TourStep,
} from "@/lib/tour";
import { cn } from "@/lib/utils";

const KEY = "latchkey.tour.v1";
const OPEN_EVENT = "latchkey:tour";

/** Opens the journey picker from anywhere (the menu, the demo panel). */
export function openTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const ICONS: Record<string, typeof Compass> = {
  "layout-dashboard": LayoutDashboard,
  "door-open": DoorOpen,
  "key-round": KeyRound,
  "book-open": BookOpen,
  "spray-can": SprayCan,
  "shopping-basket": ShoppingBasket,
  "calendar-heart": CalendarHeart,
  wrench: Wrench,
  "calendar-sync": CalendarSync,
  "chart-line": ChartLine,
};

function useProgress(): [TourProgress, (p: TourProgress) => void] {
  const [p, setP] = useState<TourProgress>(EMPTY_PROGRESS);
  useEffect(() => {
    try {
      setP(readProgress(JSON.parse(localStorage.getItem(KEY) ?? "null")));
    } catch {
      setP(EMPTY_PROGRESS);
    }
  }, []);
  const save = useCallback((next: TourProgress) => {
    setP(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not kept this time.
    }
  }, []);
  return [p, save];
}

/**
 * The guided tour of the dashboard (journeys in src/lib/tour.ts). A picker
 * asks which journey to take, quick or comprehensive, with a tick on each
 * one finished and "carry on" where one was left. A journey shows one step
 * at a time: the part of the page it's about lit up with a pointer at it,
 * what it is, and what to do (click it, or just look). On the demo account
 * the picker opens by itself the first time; anyone can open it from the menu.
 */
export function GuidedTour({ autoOffer }: { autoOffer: boolean }) {
  const [p, save] = useProgress();
  const [picker, setPicker] = useState(false);
  const [finished, setFinished] = useState<Journey | null>(null);
  const latest = useRef(p);
  latest.current = p;

  useEffect(() => {
    const open = () => setPicker(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);
  // The demo: offered once per browser, a moment after the dashboard appears.
  useEffect(() => {
    if (!autoOffer) return;
    const t = window.setTimeout(() => {
      if (!latest.current.offered && !latest.current.active) {
        save({ ...latest.current, offered: true });
        setPicker(true);
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [autoOffer, save]);

  const active = p.active ? (JOURNEYS.find((j) => j.id === p.active) ?? null) : null;
  const state = active ? p.journeys[active.id] : null;
  const steps = active && state ? stepsFor(active, state.mode) : [];
  const step = state ? steps[state.at] : undefined;

  function go(by: 1 | -1) {
    const next = moveStep(latest.current, by);
    if (active && next.journeys[active.id]?.done && !next.active) setFinished(active);
    save(next);
  }

  return (
    <>
      <TourPicker
        open={picker}
        onOpenChange={setPicker}
        progress={p}
        onMode={(mode) => save({ ...p, mode })}
        onStart={(id) => {
          setPicker(false);
          setFinished(null);
          save(startJourney(p, id, p.mode));
        }}
      />
      {active && step && state ? (
        <TourStepView
          key={`${active.id}:${state.mode}:${state.at}`}
          journey={active}
          step={step}
          index={state.at}
          total={steps.length}
          onBack={() => go(-1)}
          onNext={() => go(1)}
          onClose={() => save({ ...p, active: null })}
          onJourneys={() => {
            save({ ...p, active: null });
            setPicker(true);
          }}
        />
      ) : null}
      {finished ? (
        <Finished
          journey={finished}
          progress={p}
          onNext={(id) => {
            setFinished(null);
            save(startJourney(p, id, p.mode));
          }}
          onJourneys={() => {
            setFinished(null);
            setPicker(true);
          }}
          onClose={() => setFinished(null)}
        />
      ) : null}
    </>
  );
}

function TourPicker({
  open,
  onOpenChange,
  progress,
  onMode,
  onStart,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  progress: TourProgress;
  onMode: (m: TourMode) => void;
  onStart: (id: string) => void;
}) {
  const { done, total } = coverage(progress);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Compass className="size-6 text-primary" /> {copy.pickerTitle}
          </DialogTitle>
          <DialogDescription>{copy.pickerBody}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="radiogroup"
            aria-label={copy.modeLabel}
            className="flex rounded-xl bg-muted p-1"
          >
            {(["quick", "full"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={progress.mode === m}
                onClick={() => onMode(m)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium",
                  progress.mode === m ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                {m === "quick" ? copy.quick : copy.full}
              </button>
            ))}
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ListChecks className="size-4" /> {copy.coverage(done, total)}
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {JOURNEYS.map((j) => {
            const s = progress.journeys[j.id];
            const Icon = ICONS[j.icon] ?? Compass;
            const n = stepsFor(j, progress.mode).length;
            const resume = s && !s.done && s.mode === progress.mode && s.at > 0;
            return (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => onStart(j.id)}
                  className={cn(
                    "flex h-full w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors hover:bg-secondary",
                    s?.done ? "border-primary/40 bg-primary/5" : "border-border",
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      {rebrand(j.title)}
                      {s?.done ? (
                        <CircleCheck className="size-4 text-success" aria-label={copy.doneLabel} />
                      ) : null}
                    </span>
                    <span className="block text-sm text-muted-foreground">{rebrand(j.blurb)}</span>
                    <span className="mt-1 block text-xs font-medium text-primary">
                      {resume ? copy.resume(s!.at + 1, n) : s?.done ? copy.again(n) : copy.steps(n)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Where an element is on screen, kept up to date as the page scrolls or changes. */
function useRect(el: Element | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!el) return setRect(null);
    let frame = 0;
    let last = "";
    const tick = () => {
      const r = el.getBoundingClientRect();
      const sig = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (sig !== last) {
        last = sig;
        setRect(r);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [el]);
  return rect;
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none";
}

/** The first visible element for a target, looked for until the page has loaded it (or not). */
function useTarget(selector: string | null, active: boolean) {
  const [el, setEl] = useState<Element | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setEl(null);
    setMissing(false);
    if (!selector || !active) return;
    const started = Date.now();
    const find = () => [...document.querySelectorAll(selector)].find(visible) ?? null;
    const id = window.setInterval(() => {
      const hit = find();
      if (hit) {
        window.clearInterval(id);
        hit.scrollIntoView({ block: "center", behavior: "smooth" });
        setEl(hit);
      } else if (Date.now() - started > 5000) {
        window.clearInterval(id);
        setMissing(true);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [selector, active]);
  return { el, missing };
}

function TourStepView({
  journey,
  step,
  index,
  total,
  onBack,
  onNext,
  onClose,
  onJourneys,
}: {
  journey: Journey;
  step: TourStep;
  index: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
  onJourneys: () => void;
}) {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const global = !!step.target?.startsWith("nav:");
  const onPage = global || location.pathname === step.page;
  // A tab on the page (Settings' ?focus, Properties' ?tab): open it ourselves once the guest is on the page.
  const searchMatches =
    !step.search ||
    Object.entries(step.search).every(
      ([k, v]) => String((location.search as Record<string, unknown>)[k] ?? "") === v,
    );
  useEffect(() => {
    if (onPage && !global && !searchMatches)
      void navigate({ to: step.page as never, search: step.search as never, replace: true });
  }, [onPage, global, searchMatches, navigate, step.page, step.search]);

  const selector = selectorFor(step.target);
  const { el, missing } = useTarget(selector, onPage && searchMatches);
  const rect = useRect(el);
  const related = useMemo(() => step.related ?? [], [step.related]);

  // A click step moves on once the lit-up part is clicked (after any page change it starts).
  const next = useRef(onNext);
  next.current = onNext;
  useEffect(() => {
    if (!el || step.action !== "click") return;
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Node && el.contains(e.target))
        window.setTimeout(() => next.current(), 450);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [el, step.action]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pad = 8;
  const box = rect
    ? {
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;
  // The card goes below the lit-up part if there's room, else above; on a phone it sits at the bottom.
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const phone = vw < 640;
  const cardW = Math.min(360, vw - 24);
  const below = box ? box.top + box.height + 220 < vh : true;
  const cardStyle: React.CSSProperties =
    !box || phone
      ? {}
      : {
          position: "fixed",
          width: cardW,
          left: Math.min(Math.max(12, box.left), vw - cardW - 12),
          top: below ? Math.min(box.top + box.height + 44, vh - 240) : undefined,
          bottom: below ? undefined : Math.max(12, vh - box.top + 44),
        };

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[300]"
      role="dialog"
      aria-label={rebrand(journey.title)}
    >
      {/* Everything dimmed but the part being shown, which gets a bright border; the page still works. */}
      {box ? (
        <div
          aria-hidden
          className="absolute rounded-2xl border-[3px] border-accent transition-all duration-300"
          style={{ ...box, boxShadow: "0 0 0 9999px rgba(15, 23, 20, 0.5)" }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/40" />
      )}
      {box ? (
        <span
          aria-hidden
          className="tour-point absolute text-accent drop-shadow"
          style={{
            left: box.left + box.width / 2 - 14,
            top: below || phone ? box.top + box.height + 2 : box.top - 36,
          }}
        >
          <MousePointerClick className="size-8" />
        </span>
      ) : null}
      {related.map((t) => (
        <RelatedOutline key={t} target={t} />
      ))}

      <section
        ref={shield}
        className={cn(
          "pointer-events-auto rounded-2xl border border-border bg-surface p-4 text-foreground shadow-2xl",
          !box || phone
            ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto max-w-md"
            : "",
        )}
        style={cardStyle}
      >
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-accent">
            {rebrand(journey.title)} · {copy.stepOf(index + 1, total)}
          </p>
          <button
            type="button"
            onClick={onJourneys}
            className="text-xs font-medium text-primary hover:underline"
          >
            {copy.journeys}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="-mr-1 -mt-1 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-1 flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>
        <h2 className="mt-3 text-lg">{rebrand(step.title)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{rebrand(step.body)}</p>
        {!onPage ? (
          <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">{copy.elsewhere}</p>
        ) : missing ? (
          <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">{copy.missing}</p>
        ) : step.action === "click" && el ? (
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-primary">
            <MousePointerClick className="size-4" /> {copy.clickIt}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={index === 0}>
            <ArrowLeft className="size-4" /> {copy.back}
          </Button>
          <span className="flex-1" />
          {!onPage ? (
            <Button
              size="sm"
              onClick={() =>
                void navigate({ to: step.page as never, search: (step.search ?? {}) as never })
              }
            >
              {copy.takeMe} <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={onNext}>
              {index + 1 === total ? (
                <>
                  <Check className="size-4" /> {copy.finish}
                </>
              ) : (
                <>
                  {copy.next} <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

/**
 * Keeps taps and focus on the tour's card to itself, so an open drawer or
 * dialog on the page (a guest's card, say) doesn't take them as "outside"
 * and close while the tour is pointing into it.
 */
function shield(el: HTMLElement | null) {
  if (!el || el.dataset["shielded"]) return;
  el.dataset["shielded"] = "1";
  const stop = (e: Event) => e.stopPropagation();
  for (const type of ["pointerdown", "mousedown", "touchstart", "focusin"])
    el.addEventListener(type, stop);
}

/** A dashed outline round another part to look at with this step. */
function RelatedOutline({ target }: { target: string }) {
  const { el } = useTarget(selectorFor(target), true);
  const r = useRect(el);
  if (!r) return null;
  return (
    <div
      aria-hidden
      className="absolute rounded-2xl border-2 border-dashed border-accent/80"
      style={{ left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 }}
    />
  );
}

function Finished({
  journey,
  progress,
  onNext,
  onJourneys,
  onClose,
}: {
  journey: Journey;
  progress: TourProgress;
  onNext: (id: string) => void;
  onJourneys: () => void;
  onClose: () => void;
}) {
  const next = nextJourney(progress);
  const { done, total } = coverage(progress);
  return createPortal(
    <div
      ref={shield}
      className="pointer-events-auto fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[300] mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-2xl"
      role="status"
    >
      <div className="flex items-start gap-3">
        <CircleCheck className="size-7 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.finishedTitle(rebrand(journey.title))}</h2>
          <p className="text-sm text-muted-foreground">{copy.coverage(done, total)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.close}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onJourneys}>
          {copy.allJourneys}
        </Button>
        {next ? (
          <Button size="sm" onClick={() => onNext(next.id)}>
            {copy.nextJourney(rebrand(next.title))} <ArrowRight className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
