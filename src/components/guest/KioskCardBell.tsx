import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, Clock } from "lucide-react";

import { headerIconClass } from "@/components/guest/KioskClocks";
import { guest as copy } from "@/content/copy";
import { kioskCardPicker, kioskSetCards, type PickerEntry } from "@/lib/goodbye.functions";
import { pingOtherKiosks } from "@/lib/kiosk-ping";
import { deviceToken } from "@/lib/kiosk-presence";
import { cn } from "@/lib/utils";

const keyOf = (i: PickerEntry) => `${i.kind}:${i.handle}`;

/**
 * The bell beside the screensaver button on a paired door tablet (when the
 * host leaves it on): today's arriving and leaving guests, ticked when their
 * card is on the screen, with the time each comes on by itself. Tick several
 * and "Show on screen": the cards share the screen as usual. No trip to the
 * dashboard needed.
 */
export function KioskCardBell({
  code,
  onApplied,
  className,
}: {
  code: string;
  onApplied: () => void;
  /** The button's look where the default doesn't suit (over the cards' own colour). */
  className?: string;
}) {
  const listFn = useServerFn(kioskCardPicker);
  const setFn = useServerFn(kioskSetCards);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickerEntry[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const device = deviceToken(code);
    if (!device) return;
    setItems(null);
    setError(false);
    void listFn({ data: { code, device } })
      .then((r) => {
        setItems(r.items);
        setChosen(new Set(r.items.filter((i) => i.showing).map(keyOf)));
      })
      .catch(() => setError(true));
  }, [open, code, listFn]);

  // Closes by itself if left open.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setOpen(false), 2 * 60_000);
    return () => window.clearTimeout(id);
  }, [open]);

  const changes = useMemo(
    () =>
      (items ?? [])
        .filter((i) => chosen.has(keyOf(i)) !== i.showing)
        .map((i) => ({ handle: i.handle, kind: i.kind, show: chosen.has(keyOf(i)) })),
    [items, chosen],
  );

  async function apply() {
    const device = deviceToken(code);
    if (!device) return;
    if (!changes.length) return setOpen(false);
    setBusy(true);
    setError(false);
    try {
      await setFn({ data: { code, device, changes } });
      pingOtherKiosks(code);
      onApplied();
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (i: PickerEntry) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(keyOf(i))) n.delete(keyOf(i));
      else n.add(keyOf(i));
      return n;
    });

  const group = (kind: "in" | "out") => {
    const list = (items ?? []).filter((i) => i.kind === kind);
    if (!list.length) return null;
    return (
      <section>
        <h3 className="mb-[0.4em] text-[0.8em] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {kind === "in" ? copy.bellArriving : copy.bellLeaving}
        </h3>
        <ul className="space-y-[0.4em]">
          {list.map((i) => {
            const on = chosen.has(keyOf(i));
            return (
              <li key={keyOf(i)}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(i)}
                  className={cn(
                    "flex min-h-[3.5em] w-full items-center gap-[0.75em] rounded-xl border-2 px-[0.75em] py-[0.5em] text-left",
                    on ? "border-primary bg-primary/10" : "border-border bg-background",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-[1.75em] shrink-0 place-items-center rounded-md border-2",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/50",
                    )}
                  >
                    {on ? <Check className="size-[1.1em]" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1.1em] font-semibold">
                      {i.name}
                      {i.room ? (
                        <span className="font-normal text-muted-foreground"> · {i.room}</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-[0.3em] text-[0.85em] text-muted-foreground">
                      {i.showing ? (
                        copy.bellOnScreen
                      ) : i.autoAt ? (
                        <>
                          <Clock className="size-[1em]" aria-hidden /> {copy.bellAutoAt(i.autoAt)}
                        </>
                      ) : (
                        copy.bellNotSet
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={copy.bellOpen}
        aria-expanded={open}
        title={copy.bellOpen}
        className={cn(headerIconClass, className, open && "bg-muted text-foreground")}
      >
        <Bell className="size-[2em]" aria-hidden />
      </button>
      {open ? (
        <>
          {/* Tapping anywhere else closes it. */}
          <div className="fixed inset-0 z-[90]" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label={copy.bellTitle}
            className="absolute right-0 top-full z-[91] mt-[0.5em] flex max-h-[calc(var(--kiosk-h,100vh)*0.75)] w-[min(26em,90vw)] flex-col rounded-2xl border border-border bg-card p-[1em] text-left text-[1rem] font-normal text-card-foreground shadow-2xl"
          >
            <p className="text-[1.15em] font-semibold">{copy.bellTitle}</p>
            <p className="mb-[0.75em] text-[0.85em] text-muted-foreground">{copy.bellHelp}</p>
            <div className="min-h-0 flex-1 space-y-[0.9em] overflow-y-auto">
              {items === null && !error ? (
                <p className="text-muted-foreground">…</p>
              ) : items && !items.length ? (
                <p className="text-muted-foreground">{copy.bellEmpty}</p>
              ) : (
                <>
                  {group("in")}
                  {group("out")}
                </>
              )}
            </div>
            {error ? (
              <p className="mt-[0.5em] text-[0.9em] text-destructive">{copy.bellError}</p>
            ) : null}
            <div className="mt-[0.75em] grid grid-cols-2 gap-[0.5em]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[3em] rounded-xl border border-border bg-background font-medium"
              >
                {copy.bellClose}
              </button>
              <button
                type="button"
                disabled={busy || !items?.length}
                onClick={() => void apply()}
                className="min-h-[3em] rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
              >
                {copy.bellApply}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
