/* eslint-disable @typescript-eslint/no-explicit-any -- the 0062 tables aren't in the generated types yet */
/**
 * Commission Partner identity check (agreement 3.4, 17.1, 17.2): the partner
 * photographs their ID and takes a selfie; the guest ID reader reads it;
 * rules in partner-id.ts. Photos go to the restricted Google Drive folder
 * (private-store.server.ts) and are deleted 30 days after OMS decides.
 * Super admins review, see photos only through 10-minute links with a logged
 * reason, and approve or reject.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSuperAdmin } from "@/lib/roles";
import {
  MAX_AUTO_ATTEMPTS,
  READS_PER_DAY,
  judgePartnerId,
  partnerIdStatus,
  type IdOutcome,
} from "./partner-id";

type Ctx = { userId: string; supabase: unknown };

async function data() {
  return import("./partner-data.server");
}

const jpeg = z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);

const DAY = 86_400_000;

function bytesOf(dataUrl: string): Uint8Array {
  return Uint8Array.from(atob(dataUrl.split(",")[1]!), (c) => c.charCodeAt(0));
}

/** One identity check attempt. The full-size ID photo is used for reading only and never kept. */
export const submitPartnerId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        consent: z.literal(true),
        idFull: jpeg.max(4_000_000),
        idSmall: jpeg.max(560_000),
        selfie: jpeg.max(300_000),
      })
      .parse(d),
  )
  .handler(async ({ data: input, context }) => {
    const userId = (context as Ctx).userId;
    const { adminDb, check, loadPartnerConfig, logPartnerEvent } = await data();
    const db = await adminDb();
    const p = check(
      await db.from("partners").select("*").eq("user_id", userId).maybeSingle(),
    ) as Record<string, any> | null;
    if (!p) throw new Error("Apply to be a Commission Partner first.");
    if (p["terminated_at"] && Date.parse(p["terminated_at"]) <= Date.now())
      throw new Error("Your Commission Partner arrangement has ended.");
    const { data: acc } = await db
      .from("partner_agreement_acceptances")
      .select("typed_name")
      .eq("partner_id", p["id"])
      .order("signed_at", { ascending: false })
      .limit(1);
    const signedName = ((acc ?? [])[0] as { typed_name?: string } | undefined)?.typed_name ?? null;
    if (!signedName)
      throw new Error("Sign the agreement first: we compare your ID with the name you sign with.");
    const { data: prior } = await db
      .from("partner_id_checks")
      .select("status, created_at")
      .eq("partner_id", p["id"])
      .order("created_at", { ascending: false });
    const checks = (prior ?? []) as Array<{ status: string; created_at: string }>;
    if (checks.some((c) => c.status === "approved"))
      return { status: "approved" as const, message: null };
    if (checks.some((c) => c.status === "manual_review" || c.status === "auto_passed"))
      return {
        status: "waiting" as const,
        message: "We're already checking your ID. We'll email you.",
      };
    // A rejected check starts the attempts again (OMS may ask for another document, 3.4(d)).
    const lastDecided = checks.findIndex((c) => c.status === "rejected");
    const attempt = (lastDecided < 0 ? checks.length : lastDecided) + 1;
    if (checks.filter((c) => Date.parse(c.created_at) > Date.now() - DAY).length >= READS_PER_DAY)
      throw new Error(
        "You've tried several times today. Please try again tomorrow, or contact us.",
      );

    const { jobAllowed, bumpUsage } = await import("./usage.server");
    const today = new Date().toISOString().slice(0, 10);
    let outcome: IdOutcome;
    let read: import("./guest-records").IdRead | null = null;
    if (!(await jobAllowed("ai_id_reading"))) {
      outcome = {
        status: "manual_review",
        reason: "ai_off",
        nameMatch: "not_matched",
        expired: false,
        homemadeOrScreen: false,
      };
    } else {
      const { readIdDetails } = await import("./checkin.server");
      try {
        read = await readIdDetails(input.idFull);
        await bumpUsage(null, "ai:id_read");
      } catch (e) {
        console.error("Partner ID read failed", e instanceof Error ? e.message : e);
        read = null;
      }
      outcome = judgePartnerId({
        read,
        today,
        selfieTaken: true,
        signedName,
        legalName: p["legal_name"],
        attempt,
      });
    }

    const config = await loadPartnerConfig(db);
    const keepImages = config.idImagesStored && outcome.status !== "auto_failed";
    const { last4Of } = await import("./guest-records");
    const row = check(
      await db
        .from("partner_id_checks")
        .insert({
          partner_id: p["id"],
          attempt,
          status: outcome.status,
          fail_reason: outcome.reason,
          doc_type: read?.documentType ?? null,
          issuing_country: read?.issuingCountry ?? null,
          nationality: read?.nationality ?? null,
          date_of_birth:
            read?.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(read.dateOfBirth)
              ? read.dateOfBirth
              : null,
          expiry_date:
            read?.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(read.expiryDate)
              ? read.expiryDate
              : null,
          doc_last4: last4Of(read?.numberLast4 ?? null),
          name_on_doc: read?.fullName ?? null,
          name_match: read ? outcome.nameMatch : null,
          homemade_or_screen: read ? outcome.homemadeOrScreen : null,
          expired: read ? outcome.expired : null,
          selfie_taken: true,
        })
        .select("id")
        .single(),
    ) as { id: string };
    if (keepImages) {
      const { storePrivate } = await import("./private-store.server");
      const owner = {
        ownerKey: p["id"] as string,
        ownerLabel: (p["legal_name"] as string) ?? "Partner",
      };
      const idRef = await storePrivate({
        kind: "partner_id",
        ...owner,
        name: `id-${row.id}.jpg`,
        mime: "image/jpeg",
        bytes: bytesOf(input.idSmall),
        ref: { table: "partner_id_checks", column: "id_image_path" },
      });
      const selfieRef = await storePrivate({
        kind: "partner_selfie",
        ...owner,
        name: `selfie-${row.id}.jpg`,
        mime: "image/jpeg",
        bytes: bytesOf(input.selfie),
        ref: { table: "partner_id_checks", column: "selfie_image_path" },
      });
      await db
        .from("partner_id_checks")
        .update({ id_image_path: idRef, selfie_image_path: selfieRef })
        .eq("id", row.id);
    }
    await db
      .from("partners")
      .update({ id_check_status: partnerIdStatus(outcome), updated_at: new Date().toISOString() })
      .eq("id", p["id"]);
    await logPartnerEvent(db, {
      partner_id: p["id"],
      actor: userId,
      action: "id_check_submitted",
      details: {
        attempt,
        status: outcome.status,
        reason: outcome.reason,
        name_match: outcome.nameMatch,
      },
    });
    const { ID_FAIL_WORDS } = await import("./partner-id");
    return {
      status: outcome.status === "auto_failed" ? ("try_again" as const) : ("waiting" as const),
      message: outcome.reason ? (ID_FAIL_WORDS[outcome.reason] ?? null) : null,
      attemptsLeft: Math.max(0, MAX_AUTO_ATTEMPTS - attempt),
    };
  });

/* --------------------------------------------------------------- admin */

/** Checks to review and recent decisions; no photos (those need a reason, below). */
export const adminPartnerIdChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin((context as Ctx).supabase);
    const { adminDb, isMissingTable } = await data();
    const db = await adminDb();
    const { data: rows, error } = await db
      .from("partner_id_checks")
      .select(
        "id, partner_id, attempt, status, fail_reason, doc_type, issuing_country, nationality, date_of_birth, expiry_date, doc_last4, name_on_doc, name_match, homemade_or_screen, expired, selfie_taken, id_image_path, selfie_image_path, images_deleted_at, reviewed_at, review_note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (isMissingTable(error)) return { setUp: false as const, checks: [] };
      throw new Error(error.message);
    }
    return {
      setUp: true as const,
      checks: ((rows ?? []) as Array<Record<string, any>>).map(
        ({ id_image_path, selfie_image_path, ...r }) => ({
          ...r,
          hasImages: !!(id_image_path || selfie_image_path),
        }),
      ),
    };
  });

/** 10-minute links to a check's photos; every view is logged with the reason given (17.1). */
export const viewPartnerIdImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ checkId: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).parse(d),
  )
  .handler(async ({ data: input, context }) => {
    await requireSuperAdmin((context as Ctx).supabase);
    const { adminDb, check } = await data();
    const db = await adminDb();
    const c = check(
      await db
        .from("partner_id_checks")
        .select("id, id_image_path, selfie_image_path")
        .eq("id", input.checkId)
        .single(),
    ) as { id: string; id_image_path: string | null; selfie_image_path: string | null };
    if (!c.id_image_path && !c.selfie_image_path)
      throw new Error("These photos have been deleted.");
    const { hashIp, requestIp } = await import("./ip-hash.server");
    check(
      await db.from("partner_id_access_log").insert({
        check_id: c.id,
        viewer_user_id: (context as Ctx).userId,
        ip_hash: hashIp(requestIp(getRequest().headers)),
        reason: input.reason,
      }),
    );
    const { signPrivateLinks } = await import("./private-store.server");
    const links = await signPrivateLinks(
      [c.id_image_path, c.selfie_image_path],
      600,
      "partner-id.jpg",
    );
    return {
      id: c.id_image_path ? (links[c.id_image_path] ?? null) : null,
      selfie: c.selfie_image_path ? (links[c.selfie_image_path] ?? null) : null,
    };
  });

/** Approves or rejects a check (3.4); the photos are then deleted 30 days later. */
export const decidePartnerIdCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        checkId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().min(3).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data: input, context }) => {
    await requireSuperAdmin((context as Ctx).supabase);
    const { adminDb, check, logPartnerEvent } = await data();
    const db = await adminDb();
    const now = new Date();
    const c = check(
      await db
        .from("partner_id_checks")
        .update({
          status: input.decision,
          reviewed_by: (context as Ctx).userId,
          reviewed_at: now.toISOString(),
          review_note: input.note,
          images_delete_after: new Date(now.getTime() + 30 * DAY).toISOString(),
        })
        .eq("id", input.checkId)
        .select("partner_id")
        .single(),
    ) as { partner_id: string };
    await db
      .from("partners")
      .update({ id_check_status: input.decision, updated_at: now.toISOString() })
      .eq("id", c.partner_id);
    await logPartnerEvent(db, {
      partner_id: c.partner_id,
      actor: (context as Ctx).userId,
      action: `id_check_${input.decision}`,
      details: { check: input.checkId, note: input.note },
    });
    return { ok: true };
  });
