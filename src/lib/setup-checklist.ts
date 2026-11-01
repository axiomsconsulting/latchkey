/**
 * The getting-started checklist on Today: each step ticks itself off from
 * what the business has really set up, a host can skip the ones that don't
 * apply to them, and the card goes once nothing is left. Pure; tested in
 * tests/setup-checklist.test.ts.
 */

export const SETUP_STEPS = ["rooms", "calendar", "pin", "guide", "tablet", "payments"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export type SetupFacts = {
  rooms: number;
  calendars: number;
  pin: boolean;
  /** Guide sections the host has written or changed (not the starters). */
  guideEdits: number;
  tablets: number;
  payments: boolean;
};

/** Steps a host may skip (not everyone has a door tablet or takes card payments). */
export const OPTIONAL: readonly SetupStep[] = ["tablet", "payments", "calendar"];

export function stepDone(step: SetupStep, f: SetupFacts): boolean {
  switch (step) {
    case "rooms":
      return f.rooms > 0;
    case "calendar":
      return f.calendars > 0;
    case "pin":
      return f.pin;
    case "guide":
      return f.guideEdits > 0;
    case "tablet":
      return f.tablets > 0;
    case "payments":
      return f.payments;
  }
}

export type ChecklistItem = { step: SetupStep; done: boolean; skipped: boolean; optional: boolean };

export function checklist(
  f: SetupFacts,
  skipped: readonly string[],
): {
  items: ChecklistItem[];
  /** Steps still to do (not done, not skipped). */
  left: number;
  done: number;
} {
  const items = SETUP_STEPS.map((step) => {
    const done = stepDone(step, f);
    return {
      step,
      done,
      skipped: !done && OPTIONAL.includes(step) && skipped.includes(step),
      optional: OPTIONAL.includes(step),
    };
  });
  return {
    items,
    left: items.filter((i) => !i.done && !i.skipped).length,
    done: items.filter((i) => i.done).length,
  };
}
