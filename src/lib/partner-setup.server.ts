/* eslint-disable @typescript-eslint/no-explicit-any -- partner_setups (migration 0097) isn't in the generated types yet */
/**
 * Server-only side of partner set-ups (agreement v1.3 6.9; see
 * partner-setup.functions.ts): whether a business is still being set up, and
 * finishing the hand-over when the host accepts the owner invitation.
 */
async function canReferNow(db: unknown, p: Record<string, unknown>) {
  const { activationFor } = await import("./partner-agreement.functions");
  const { canRefer } = await import("./partner-activation");
  return canRefer(await activationFor(db as never, p as never), Date.now());
}

/** Whether this business is being set up by a partner and not handed over yet (no card until then: 6.9(c)). */
export async function setupPending(hostId: string): Promise<{
  ownerName: string;
  ownerEmail: string;
  status: string;
} | null> {
  try {
    const { adminDb } = await import("./partner-data.server");
    const db = await adminDb();
    const { data, error } = await db
      .from("partner_setups")
      .select("owner_name, owner_email, status")
      .eq("host_id", hostId)
      .in("status", ["setting_up", "invited"])
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { owner_name: string; owner_email: string; status: string };
    return { ownerName: row.owner_name, ownerEmail: row.owner_email, status: row.status };
  } catch {
    // Before migration 0097 there are no set-ups.
    return null;
  }
}

/**
 * Called after someone accepts an invitation: if it hands over a business a
 * partner set up (6.9), the host is now the owner, the partner's access ends,
 * the free trial starts again and the referral is recorded. Never fails the
 * acceptance itself.
 */
export async function completeSetupHandover(
  hostId: string,
  userId: string,
  email: string | null,
): Promise<void> {
  try {
    const { adminDb, check, loadPartnerConfig, logPartnerEvent } =
      await import("./partner-data.server");
    const db = await adminDb();
    const { data: s } = await db
      .from("partner_setups")
      .select("*")
      .eq("host_id", hostId)
      .in("status", ["setting_up", "invited"])
      .maybeSingle();
    if (!s) return;
    const setup = s as Record<string, any>;
    if (!email || email.toLowerCase() !== String(setup["owner_email"]).toLowerCase()) return;
    const { data: member } = await db
      .from("host_members")
      .select("role")
      .eq("host_id", hostId)
      .eq("user_id", userId)
      .maybeSingle();
    if ((member as { role?: string } | null)?.role !== "owner") return;
    const p = check(
      await db.from("partners").select("*").eq("id", setup["partner_id"]).maybeSingle(),
    ) as Record<string, any> | null;
    if (!p || p["user_id"] === userId) return;

    const now = new Date();
    const nowIso = now.toISOString();
    // 6.9(a): the partner's own access ends.
    await db.from("host_members").delete().eq("host_id", hostId).eq("user_id", p["user_id"]);
    // 6.9(b): the trial starts the day the host takes over.
    const { data: days } = await db.rpc("platform_trial_days");
    const trialDays = typeof days === "number" && days > 0 ? days : 30;
    await db
      .from("hosts")
      .update({
        contact_email: setup["owner_email"],
        trial_started_at: nowIso,
        trial_ends_at: new Date(now.getTime() + trialDays * 86_400_000).toISOString(),
      })
      .eq("id", hostId)
      .eq("subscription_status", "trialing");
    await db
      .from("partner_setups")
      .update({ status: "handed_over", handed_over_at: nowIso, handed_over_to: userId })
      .eq("id", setup["id"]);
    await logPartnerEvent(db, {
      partner_id: p["id"],
      actor: userId,
      action: "setup_handed_over",
      details: { setup: setup["id"], host_id: hostId },
    });

    // The referral, if the partner's code would work today (3.6, 19.4, 20.3(e)).
    if (!(await canReferNow(db, p))) return;
    const { data: existing } = await db
      .from("referrals")
      .select("id")
      .eq("host_id", hostId)
      .maybeSingle();
    if (existing) return;
    const { recordReferral, requestHashes } = await import("./partner-referrals.server");
    const { ipHash, deviceHash } = await requestHashes(null);
    await recordReferral(db, await loadPartnerConfig(db), {
      hostId,
      partnerId: p["id"],
      ownerUserId: userId,
      source: "setup",
      clickedAt: null,
      signUpAt: nowIso,
      ipHash,
      deviceHash,
    });
  } catch (e) {
    console.error("Hand-over follow-up failed", e instanceof Error ? e.message : e);
  }
}
