/**
 * When a Commission Partner's code and link may create Referred Hosts
 * (agreement v1.0 clauses 3.6, 19.4, 20.1, 20.3(e)). Pure, tested.
 *
 * All of: active and not stopped (a future Stop Date takes effect on that
 * day); signed the agreement; OMS approved their identity check; OMS
 * approved the application and confirmed the signature; and, once a newer
 * version is in force, signed that one too.
 */

export type IdCheckStatus = "not_started" | "pending" | "manual_review" | "approved" | "rejected";

export type ActivationInput = {
  status: string;
  terminated_at: string | null;
  id_check_status: string | null;
  /** The partner's latest signed agreement, if any. */
  acceptance: { version: string; oms_confirmed_at: string | null } | null;
  /** The version in force now and when it took effect. */
  current: { version: string; effective_from: string | null } | null;
};

export type Missing =
  "agreement" | "new_version" | "id_check" | "oms_approval" | "stopped" | "not_active";

/** What still stands between the partner and a working code, in the order they'd do it. */
export function activationMissing(p: ActivationInput, now: number): Missing[] {
  const out: Missing[] = [];
  const stop = p.terminated_at ? Date.parse(p.terminated_at) : null;
  if (stop !== null && stop <= now) return ["stopped"];
  if (!p.acceptance) out.push("agreement");
  else if (p.current && p.acceptance.version !== p.current.version) {
    const inForce = !p.current.effective_from || Date.parse(p.current.effective_from) <= now;
    if (inForce) out.push("new_version");
  }
  if ((p.id_check_status ?? "not_started") !== "approved") out.push("id_check");
  if (!p.acceptance?.oms_confirmed_at || p.status !== "active") out.push("oms_approval");
  if (p.status !== "active" && !out.includes("oms_approval")) out.push("not_active");
  return out;
}

/** The code and link work only with nothing missing. */
export function canRefer(p: ActivationInput, now: number): boolean {
  return activationMissing(p, now).length === 0;
}

/**
 * Whether OMS may activate the partner now (3.6): signed the version in
 * force and identity approved. OMS's own approval is the act itself.
 */
export function activationBlockers(p: ActivationInput, now: number): Missing[] {
  return activationMissing(p, now).filter((m) => m !== "oms_approval" && m !== "not_active");
}

export const MISSING_WORDS: Record<Missing, string> = {
  agreement: "Sign the Commission Partner agreement.",
  new_version: "Read and accept the new version of the agreement.",
  id_check: "Verify your identity with a photo ID and a selfie.",
  oms_approval: "Wait for Latchkey to approve your application and confirm your signature.",
  stopped: "Your Commission Partner arrangement has ended.",
  not_active: "Your account isn't active.",
};
