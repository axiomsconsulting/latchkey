/**
 * Recording a referral on the server (a code or link at sign-up, or a
 * hand-over under agreement v1.3 6.9), and the request's hashed IP and
 * device. Server only: it reads the request.
 */
import { getRequest } from "@tanstack/react-start/server";

export async function requestHashes(deviceId: string | null | undefined) {
  const { requestIp } = await import("./ip-hash.server");
  const { stableHash } = await import("./partner-identity.server");
  return {
    ipHash: stableHash("ip", requestIp(getRequest().headers)),
    deviceHash: stableHash("device", deviceId ?? null),
  };
}

/**
 * Records a referral once the caller has decided it may count: the host's
 * identity keys, the terms snapshot on the Sign-up Date, the fraud checks and
 * the log. Used by a code or link at sign-up and by a hand-over (agreement
 * v1.3 6.9, source "setup"). Null when no terms were in force that day.
 */
export async function recordReferral(
  db: import("./partner-data.server").AnyDb,
  config: import("./partner-config").PartnerConfig,
  r: {
    hostId: string;
    partnerId: string;
    ownerUserId: string | null;
    source: "link" | "cookie" | "typed" | "setup";
    clickedAt: string | null;
    signUpAt: string;
    ipHash: string | null;
    deviceHash: string | null;
  },
): Promise<{ id: string; status: string } | null> {
  const {
    check,
    hostFacts,
    labelFor,
    logPartnerEvent,
    runReferralChecks,
    saveHostKeys,
    snapshotFor,
  } = await import("./partner-data.server");
  const snapshot = await snapshotFor(db, r.signUpAt, r.partnerId, config);
  if (!snapshot) return null;
  const facts = await hostFacts(db, r.hostId);
  await saveHostKeys(db, r.hostId, facts, { ipHash: r.ipHash, deviceHash: r.deviceHash });
  const inserted = check(
    await db
      .from("referrals")
      .insert({
        host_id: r.hostId,
        partner_id: r.partnerId,
        owner_user_id: r.ownerUserId,
        source: r.source,
        clicked_at: r.clickedAt,
        sign_up_at: r.signUpAt,
        terms_id: snapshot.terms_id,
        terms_snapshot: snapshot,
        status: "pending_review",
        host_label: labelFor(facts),
      })
      .select("id")
      .single(),
  ) as { id: string };
  const flags = await runReferralChecks(db, inserted.id, config);
  await logPartnerEvent(db, {
    partner_id: r.partnerId,
    referral_id: inserted.id,
    actor: r.ownerUserId,
    action: "referral_attached",
    details: {
      source: r.source,
      terms: snapshot.label,
      flags: flags.map((f) => `${f.kind}:${f.strength}`),
    },
    ip_hash: r.ipHash,
  });
  const { data: after } = await db
    .from("referrals")
    .select("status")
    .eq("id", inserted.id)
    .single();
  return {
    id: inserted.id,
    status: (after as { status?: string } | null)?.status ?? "pending_review",
  };
}
