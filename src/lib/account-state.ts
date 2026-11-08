/**
 * Pausing and closing a host business (migration 0097). Pure, tested.
 *
 * - Pause: the owner or Latchkey admin; billing is paused at Stripe and the
 *   business has no access (as when a subscription ends) until resumed.
 * - Resume: the owner, if they paused it; Latchkey admin always.
 * - Close: the owner or Latchkey admin; the subscription is cancelled.
 * - Reopen: Latchkey admin only (the owner then subscribes again).
 */

export type AccountState = {
  suspended_at?: string | null;
  suspend_source?: string | null;
  closed_at?: string | null;
};

export type AccountAction = "pause" | "resume" | "close" | "reopen";

export function accountActions(
  s: AccountState,
  who: { owner: boolean; admin: boolean },
): Record<AccountAction, boolean> {
  const closed = !!s.closed_at;
  const paused = !!s.suspended_at;
  const any = who.owner || who.admin;
  return {
    pause: any && !closed && !paused,
    resume: !closed && paused && (who.admin || (who.owner && s.suspend_source !== "admin")),
    close: any && !closed,
    reopen: who.admin && closed,
  };
}

/** Why an action was refused, in words for an error. */
export function actionProblem(
  action: AccountAction,
  s: AccountState,
  who: { owner: boolean; admin: boolean },
): string | null {
  if (accountActions(s, who)[action]) return null;
  if (!who.owner && !who.admin) return "Only the business's owner can do that.";
  if (action === "resume" && s.suspend_source === "admin" && !who.admin)
    return "Latchkey paused this business. Contact Latchkey support to resume it.";
  if (action === "reopen") return "Only Latchkey can reopen a closed business.";
  if (s.closed_at) return "This business is closed.";
  if (action === "pause") return "This business is already paused.";
  return "This business isn't paused.";
}
