/**
 * The guided tour stays in step with the app: every page it visits exists,
 * and every part it points at is still in the code. When a feature moves or
 * goes, this fails and the journey gets updated with it.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { EMPTY_PROGRESS, JOURNEYS, coverage, moveStep, nextJourney, readProgress, selectorFor, startJourney, stepsFor } from "@/lib/tour";
import { NAV_BUILT_INS } from "@/lib/ui-config";

const root = join(__dirname, "../src");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}
const files = walk(root);
const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
// Named in the code as data-tour="x", tourName="x", tour: "x", or a quoted name inside data-tour={...}.
const literal = new Set([
  ...[...all.matchAll(/(?:data-tour=|tourName=|tour: )"([a-z0-9-]+)"/g)].map((m) => m[1]!),
  ...[...all.matchAll(/data-tour=\{([^}]*)\}/g)].flatMap((m) => [...m[1]!.matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]!)),
]);
const today = readFileSync(join(root, "routes/_authenticated/app.today.tsx"), "utf8");
const todayIds = new Set([...today.matchAll(/(?:id: |<Card id=)"([A-Za-z]+)"/g)].map((m) => m[1]!));
const settings = readFileSync(join(root, "routes/_authenticated/app.settings.tsx"), "utf8");
const focus = new Set([...(/const FOCUS = \[([^\]]+)\]/.exec(settings)?.[1] ?? "").matchAll(/"([A-Za-z0-9]+)"/g)].map((m) => m[1]!));
const groups = new Set([...(/const SETTINGS_GROUPS = \[([\s\S]+?)\] as const/.exec(settings)?.[1] ?? "").matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]!));
const navIds = new Set(NAV_BUILT_INS.map((n) => n.id));
const routeFile = (page: string) => join(root, "routes/_authenticated", `${page.replace(/^\//, "").replace(/\//g, ".")}.tsx`);

describe("guided tour", () => {
  it("only visits pages that exist", () => {
    for (const j of JOURNEYS) for (const s of j.steps) expect(() => statSync(routeFile(s.page)), `${j.id}/${s.id}: ${s.page}`).not.toThrow();
  });

  it("only points at parts of the app that exist", () => {
    for (const j of JOURNEYS) {
      for (const s of j.steps) {
        for (const t of [s.target, ...(s.related ?? [])]) {
          if (!t) continue;
          const [kind, id] = t.includes(":") ? t.split(":", 2) : ["", t];
          const ok =
            kind === "nav" ? navIds.has(id!) : kind === "today" ? todayIds.has(id!) : kind === "settings" ? focus.has(id!) : kind === "settings-tab" ? groups.has(id!) : literal.has(t);
          expect(ok, `${j.id}/${s.id} points at ${t}, which isn't in the app any more`).toBe(true);
        }
      }
    }
  });

  it("has unique ids, quick versions and sensible words", () => {
    expect(new Set(JOURNEYS.map((j) => j.id)).size).toBe(JOURNEYS.length);
    for (const j of JOURNEYS) {
      expect(new Set(j.steps.map((s) => s.id)).size, j.id).toBe(j.steps.length);
      expect(stepsFor(j, "quick").length).toBeGreaterThan(0);
      expect(stepsFor(j, "quick").length).toBeLessThanOrEqual(j.steps.length);
      for (const s of j.steps) expect(s.title.length > 2 && s.body.length > 10, `${j.id}/${s.id}`).toBe(true);
    }
  });

  it("turns targets into selectors", () => {
    expect(selectorFor("nav:bookings")).toBe('[data-tour="nav-bookings"]');
    expect(selectorFor("today:guests")).toBe("#today-guests");
    expect(selectorFor("settings:payments")).toBe("#settings-payments, #section-payments");
    expect(selectorFor("guest-guide-link")).toBe('[data-tour="guest-guide-link"]');
    expect(selectorFor(undefined)).toBeNull();
  });

  it("keeps progress, picks up where it stopped and ticks finished journeys", () => {
    let p = startJourney(EMPTY_PROGRESS, "today", "quick");
    expect(p.active).toBe("today");
    p = moveStep(p, 1);
    expect(p.journeys["today"]!.at).toBe(1);
    // Stopped, then picked up again: same place.
    p = startJourney({ ...p, active: null }, "today", "quick");
    expect(p.journeys["today"]!.at).toBe(1);
    // A different mode starts again.
    expect(startJourney(p, "today", "full").journeys["today"]!.at).toBe(0);
    const n = stepsFor(JOURNEYS[0]!, "quick").length;
    for (let i = 0; i < n; i++) p = moveStep(p, 1);
    expect(p.journeys["today"]!.done).toBe(true);
    expect(p.active).toBeNull();
    expect(coverage(p)).toEqual({ done: 1, total: JOURNEYS.length });
    expect(nextJourney(p)?.id).toBe(JOURNEYS[1]!.id);
    // Saved progress is read safely.
    expect(readProgress({ journeys: { today: { at: 99, done: false, mode: "quick" }, gone: { at: 1 } }, active: "nope" }).journeys).toEqual({ today: { at: n - 1, done: false, mode: "quick" } });
    expect(readProgress(null)).toEqual(EMPTY_PROGRESS);
  });
});
