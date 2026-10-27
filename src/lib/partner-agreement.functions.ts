/* eslint-disable @typescript-eslint/no-explicit-any -- the 0061/0062 tables aren't in the generated types yet */
/**
 * The Commission Partner agreement on the website (agreement v1.0): the
 * text with Annex B filled in, e-signing (clause 4), the partner's copy,
 * re-acceptance of new versions (19.4), the partner's own Stop button (20.1,
 * 21.2), and publishing new versions (super admin). Rules are pure in
 * partner-agreement.ts and partner-activation.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSuperAdmin } from "@/lib/roles";
import { activationMissing, type ActivationInput } from "./partner-activation";
import {
  agreementValues,
  fillAgreement,
  fullNameProblem,
  parseMarkdown,
  settingsMismatch,
  sha256Hex,
  signingTicks,
} from "./partner-agreement";

type Ctx = { userId: string; supabase: unknown; claims?: { email?: string } };

async function data() {
  return import("./partner-data.server");
}

function siteOrigin(): string {
  const env = process.env["PUBLIC_SITE_URL"];
  if (env) return env.replace(/\/+$/, "");
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return "https://latchkey.omsestates.uk";
  }
}

type VersionRow = {
  id: string;
  version: string;
  status: string;
  published_at: string | null;
  effective_from: string | null;
  body_markdown: string;
  body_sha256: string;
};

/** The version in force now: the newest current one. */
async function currentVersion(
  db: import("./partner-data.server").AnyDb,
): Promise<VersionRow | null> {
  const { data: row, error } = await db
    .from("partner_agreement_versions")
    .select("id, version, status, published_at, effective_from, body_markdown, body_sha256")
    .eq("status", "current")
    .maybeSingle();
  if (error) {
    const { isMissingTable } = await data();
    if (isMissingTable(error)) return null;
    throw new Error(error.message);
  }
  return (row as VersionRow | null) ?? null;
}

/**
 * The agreement exactly as the partner sees it: the version in force with
 * Annex B filled from the terms in force now (their own terms, if OMS set
 * any) and the programme settings. Also whether signing is open and why not.
 */
export async function renderCurrent(partnerId: string | null) {
  const { adminDb, loadPartnerConfig, loadTerms } = await data();
  const db = await adminDb();
  const v = await currentVersion(db);
  if (!v) return null;
  const config = await loadPartnerConfig(db);
  const { termsFor } = await import("./commission");
  const rows = await loadTerms(db);
  const snap = termsFor(
    new Date().toISOString(),
    partnerId ?? "",
    rows,
    config.bonusFirstPaymentDeadlineDays,
  );
  const row = snap ? rows.find((r) => r.id === snap.terms_id) : null;
  const terms = {
    label: snap?.label ?? "none",
    effective_from: row?.effective_from ?? new Date().toISOString(),
    bonus_amount_pence: snap?.bonus_amount_pence ?? null,
    bonus_tiers: snap?.bonus_tiers ?? null,
    bonus_end_date: snap?.bonus_end_date ?? null,
  };
  const rendered = fillAgreement(
    v.body_markdown,
    agreementValues({
      version: v.version,
      publishedAt: v.published_at,
      bodySha256: v.body_sha256,
      terms,
      settings: { launchDate: config.launchDate, noticeEmail: config.noticeEmail },
    }),
  );
  const problems = [...settingsMismatch(config)];
  if (!config.noticeEmail)
    problems.push("Set the notice email under Programme decisions before signing opens.");
  if (!snap) problems.push("There are no commission terms in force.");
  return {
    version: v,
    termsId: snap?.terms_id ?? null,
    rendered,
    renderedSha256: await sha256Hex(rendered),
    ticks: signingTicks(parseMarkdown(rendered)),
    signingOpen: problems.length === 0,
    problems,
    signupsOpen: config.signupsOpen,
  };
}

/** The agreement for the reader page (no sign-in needed). */
export const getPartnerAgreement = createServerFn({ method: "GET" }).handler(async () => {
  const r = await renderCurrent(null);
  if (!r) return { ready: false as const };
  return {
    ready: true as const,
    version: r.version.version,
    publishedAt: r.version.published_at,
    bodySha256: r.version.body_sha256,
    rendered: r.rendered,
    renderedSha256: r.renderedSha256,
    ticks: r.ticks,
    signingOpen: r.signingOpen,
    signupsOpen: r.signupsOpen,
  };
});

/** Whether the join page takes applications (Phase 0), and whether this visitor may preview it. */
export const partnerProgrammeOpen = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { adminDb, loadPartnerConfig } = await data();
    return { open: (await loadPartnerConfig(await adminDb())).signupsOpen };
  } catch {
    return { open: false };
  }
});

/* ------------------------------------------------------------ partner */

async function ownPartner(userId: string) {
  const { adminDb, check } = await data();
  const db = await adminDb();
  const p = check(
    await db.from("partners").select("*").eq("user_id", userId).maybeSingle(),
  ) as Record<string, any> | null;
  return { db, p };
}

async function latestAcceptance(db: import("./partner-data.server").AnyDb, partnerId: string) {
  const { data: rows } = await db
    .from("partner_agreement_acceptances")
    .select("id, version, signed_at, oms_confirmed_at, pdf_path, emailed_at, typed_name")
    .eq("partner_id", partnerId)
    .order("signed_at", { ascending: false })
    .limit(1);
  return ((rows ?? [])[0] ?? null) as {
    id: string;
    version: string;
    signed_at: string;
    oms_confirmed_at: string | null;
    pdf_path: string | null;
    emailed_at: string | null;
    typed_name: string;
  } | null;
}

/** Everything that decides whether the partner's code works (partner-activation.ts). */
export async function activationFor(
  db: import("./partner-data.server").AnyDb,
  p: Record<string, any>,
): Promise<ActivationInput> {
  const [acc, cur] = await Promise.all([latestAcceptance(db, p["id"]), currentVersion(db)]);
  return {
    status: p["status"],
    terminated_at: p["terminated_at"] ?? null,
    id_check_status: p["id_check_status"] ?? null,
    acceptance: acc ? { version: acc.version, oms_confirmed_at: acc.oms_confirmed_at } : null,
    current: cur ? { version: cur.version, effective_from: cur.effective_from } : null,
  };
}

/** The partner's steps (sign, verify, approval), their signed copy, and the Stop option. */
export const myPartnerSteps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, p } = await ownPartner((context as Ctx).userId);
    if (!p) return { partner: false as const };
    const acc = await latestAcceptance(db, p["id"]);
    const input = await activationFor(db, p);
    const missing = activationMissing(input, Date.now());
    let pdfUrl: string | null = null;
    if (acc?.pdf_path) {
      const { signPrivateLinks } = await import("./private-store.server");
      pdfUrl =
        (
          await signPrivateLinks(
            [acc.pdf_path],
            600,
            `latchkey-partner-agreement-v${acc.version}.pdf`,
          )
        )[acc.pdf_path] ?? null;
    }
    // 4.4: the email with the copy is tried again on the next visit if it didn't go.
    if (acc && !acc.emailed_at && acc.pdf_path)
      await emailCopy(db, p, acc.id, acc.version).catch(() => null);
    return {
      partner: true as const,
      missing,
      idCheckStatus: (p["id_check_status"] as string | null) ?? "not_started",
      agreement: acc
        ? {
            version: acc.version,
            signedAt: acc.signed_at,
            confirmed: !!acc.oms_confirmed_at,
            pdfUrl,
          }
        : null,
      currentVersion: input.current?.version ?? null,
      stopped: !!p["terminated_at"] && Date.parse(p["terminated_at"]) <= Date.now(),
      stopDate: p["terminated_at"] as string | null,
      signedAtMs: acc ? Date.parse(acc.signed_at) : null,
    };
  });

async function emailCopy(
  db: import("./partner-data.server").AnyDb,
  p: Record<string, any>,
  acceptanceId: string,
  version: string,
) {
  const { sendGuestEmail } = await import("./alert-email.server");
  const { rebrand } = await import("./brand");
  const sent = await sendGuestEmail({
    to: p["email"],
    subject: rebrand(`Your signed Latchkey Commission Partner agreement (v${version})`),
    body: rebrand(
      `Thank you for signing the Latchkey Commission Partner Agreement, version ${version}.\n\nYour signed copy (a PDF with its signing certificate) is in your Commission Partner account. Download it here, and keep a copy: ${siteOrigin()}/partners\n\nNext: verify your identity in your account, if you haven't yet. Your account is activated once we've approved your identity check and confirmed your signature.`,
    ),
    key: `partner-agreement-${acceptanceId}`,
  });
  if (sent)
    await db
      .from("partner_agreement_acceptances")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", acceptanceId);
  return sent;
}

const signSchema = z.object({
  renderedSha256: z.string().regex(/^[0-9a-f]{64}$/),
  typedName: z.string().trim().min(3).max(200),
  ticks: z.array(z.literal(true)).min(1).max(20),
  signaturePng: z.string().max(300_000),
  capacity: z.enum(["individual", "company"]),
  companyName: z.string().trim().max(200).optional(),
  companyNumber: z.string().trim().max(30).optional(),
  position: z.string().trim().max(100).optional(),
});

/**
 * Signs the agreement in force (clause 4): the text is rendered again here
 * and must match what was shown, every box ticked, a full name and a drawn
 * signature. Records the evidence of 4.3, makes the signed PDF with its
 * certificate, keeps both in Google Drive, and emails the partner a link.
 */
export const signPartnerAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => signSchema.parse(d))
  .handler(async ({ data: input, context }) => {
    const userId = (context as Ctx).userId;
    const { db, p } = await ownPartner(userId);
    if (!p) throw new Error("Apply to be a Commission Partner first.");
    if (p["terminated_at"] && Date.parse(p["terminated_at"]) <= Date.now())
      throw new Error("Your Commission Partner arrangement has ended.");
    const r = await renderCurrent(p["id"]);
    if (!r) throw new Error("The agreement isn't available just now.");
    if (!r.signingOpen) throw new Error("Signing isn't open yet. Please try again later.");
    if (input.renderedSha256 !== r.renderedSha256)
      throw new Error(
        "The agreement changed while you were reading it. Please reload the page and read it again.",
      );
    if (input.ticks.length !== r.ticks.length) throw new Error("Tick every box to sign.");
    const nameProblem = fullNameProblem(input.typedName);
    if (nameProblem) throw new Error(nameProblem);
    if (input.capacity === "company" && !input.companyName)
      throw new Error("Add the company's name.");
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input.signaturePng);
    if (!m) throw new Error("Draw your signature in the box.");
    const png = Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0));
    if (png.length < 600) throw new Error("Draw your signature in the box.");

    const req = getRequest();
    const { requestIp } = await import("./ip-hash.server");
    const ip = requestIp(req.headers);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500) || null;
    const ticks = r.ticks.map((label) => ({ label, ticked: true }));
    const { check, logPartnerEvent } = await data();
    const row = check(
      await db
        .from("partner_agreement_acceptances")
        .insert({
          partner_id: p["id"],
          agreement_version_id: r.version.id,
          version: r.version.version,
          body_sha256: r.version.body_sha256,
          rendered_sha256: r.renderedSha256,
          terms_id: r.termsId,
          typed_name: input.typedName.trim(),
          ticks,
          ip,
          user_agent: userAgent,
          signing_capacity: input.capacity,
          company_name: input.capacity === "company" ? (input.companyName ?? null) : null,
          company_number: input.capacity === "company" ? (input.companyNumber ?? null) : null,
          position: input.capacity === "company" ? (input.position ?? null) : null,
        })
        .select("id, signed_at")
        .single(),
    ) as { id: string; signed_at: string };

    const { storePrivate } = await import("./private-store.server");
    const owner = {
      kind: "partner_signature" as const,
      ownerKey: p["id"] as string,
      ownerLabel: (p["legal_name"] as string) ?? "Partner",
    };
    const sigRef = await storePrivate({
      ...owner,
      name: `signature-v${r.version.version}-${row.id}.png`,
      mime: "image/png",
      bytes: png,
      ref: { table: "partner_agreement_acceptances", column: "signature_png_path" },
    });
    await db
      .from("partner_agreement_acceptances")
      .update({ signature_png_path: sigRef })
      .eq("id", row.id);

    const { signedAgreementPdf } = await import("./partner-pdf.server");
    const pdf = await signedAgreementPdf(r.rendered, {
      acceptanceId: row.id,
      version: r.version.version,
      bodySha256: r.version.body_sha256,
      renderedSha256: r.renderedSha256,
      typedName: input.typedName.trim(),
      capacity: input.capacity,
      companyName: input.companyName ?? null,
      companyNumber: input.companyNumber ?? null,
      position: input.position ?? null,
      ticks: r.ticks,
      signedAt: row.signed_at,
      ip,
      userAgent,
      signaturePng: png,
    });
    const { sha256OfBytes } = await import("./private-store");
    const pdfRef = await storePrivate({
      ...owner,
      kind: "partner_agreement",
      name: `agreement-v${r.version.version}-${row.id}.pdf`,
      mime: "application/pdf",
      bytes: pdf,
      ref: { table: "partner_agreement_acceptances", column: "pdf_path" },
    });
    await db
      .from("partner_agreement_acceptances")
      .update({ pdf_path: pdfRef, pdf_sha256: await sha256OfBytes(pdf) })
      .eq("id", row.id);
    await db
      .from("partners")
      .update({
        agreement_version: r.version.version,
        agreement_accepted_at: row.signed_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p["id"]);
    const { hashIp } = await import("./ip-hash.server");
    await logPartnerEvent(db, {
      partner_id: p["id"],
      actor: userId,
      action: "agreement_signed",
      details: {
        version: r.version.version,
        acceptance: row.id,
        rendered_sha256: r.renderedSha256,
      },
      ip_hash: hashIp(ip),
    });
    await emailCopy(db, p, row.id, r.version.version).catch(() => false);
    return { ok: true, acceptanceId: row.id };
  });

/**
 * "Stop being a Commission Partner" (20.1; also the consumer's 14-day
 * cancellation, 21.2). Ends the agreement today as an ordinary stop (20.3):
 * the code stops working; amounts already earned are still paid.
 */
export const stopBeingPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("STOP") }).parse(d))
  .handler(async ({ context }) => {
    const userId = (context as Ctx).userId;
    const { db, p } = await ownPartner(userId);
    if (!p) throw new Error("You don't have a Commission Partner account.");
    if (p["terminated_at"] && Date.parse(p["terminated_at"]) <= Date.now())
      return { ok: true, already: true };
    const { check, logPartnerEvent } = await data();
    const now = new Date().toISOString();
    check(
      await db
        .from("partners")
        .update({
          status: "terminated",
          terminated_at: now,
          terminated_by: userId,
          termination_reason: "Stopped by the partner (clause 20.1)",
          termination_for_breach: false,
          stop_source: "partner",
          updated_at: now,
        })
        .eq("id", p["id"]),
    );
    // The details read from their ID are kept for 6 years after the agreement ends (17.1).
    await db
      .from("partner_id_checks")
      .update({ retain_until: new Date(Date.now() + 6 * 365.25 * 86_400_000).toISOString() })
      .eq("partner_id", p["id"]);
    await logPartnerEvent(db, {
      partner_id: p["id"],
      actor: userId,
      action: "partner_stopped",
      details: { source: "partner" },
    });
    const { sendGuestEmail } = await import("./alert-email.server");
    const { rebrand } = await import("./brand");
    await sendGuestEmail({
      to: p["email"],
      subject: rebrand("You've stopped being a Latchkey Commission Partner"),
      body: rebrand(
        "We've ended your Commission Partner agreement today, as you asked. Your referral code and link no longer work for new sign-ups. Commission you've already earned, and commission on hosts who made their first payment before today, is still paid as clause 20.3 of the agreement says. Your statements stay in your account.",
      ),
      key: `partner-stop-${p["id"]}`,
    }).catch(() => false);
    return { ok: true, already: false };
  });

/* --------------------------------------------------------------- admin */

/** Versions, and whether signing can open, for Latchkey admin. */
export const adminAgreementOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin((context as Ctx).supabase);
    const { adminDb, isMissingTable } = await data();
    const db = await adminDb();
    const { data: rows, error } = await db
      .from("partner_agreement_versions")
      .select(
        "id, version, status, published_at, effective_from, body_sha256, reduces_terms, notice_sent_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingTable(error)) return { setUp: false as const };
      throw new Error(error.message);
    }
    const r = await renderCurrent(null);
    return {
      setUp: true as const,
      versions: rows ?? [],
      problems: r?.problems ?? ["No version is in force."],
      signingOpen: !!r?.signingOpen,
    };
  });

/**
 * Publishes a new version (19.1): the text as given, in force from
 * `effectiveFrom`. A version that reduces partners' terms needs the notice
 * sent at least 30 days before it takes effect. The old version is retired
 * once the new one is in force; partners then re-accept (19.4).
 */
export const publishAgreementVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        version: z
          .string()
          .trim()
          .regex(/^\d+\.\d+$/),
        bodyMarkdown: z.string().min(1000).max(400_000),
        effectiveFrom: z.string().datetime(),
        reducesTerms: z.boolean(),
        noticeSentAt: z.string().datetime().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data: input, context }) => {
    await requireSuperAdmin((context as Ctx).supabase);
    const { adminDb, check, logPartnerEvent } = await data();
    const db = await adminDb();
    if (input.reducesTerms) {
      if (!input.noticeSentAt)
        throw new Error("A version that reduces terms needs the date notice was sent.");
      if (Date.parse(input.effectiveFrom) < Date.parse(input.noticeSentAt) + 30 * 86_400_000)
        throw new Error(
          "Give at least 30 days' notice: it can take effect 30 days after the notice at the earliest (clause 19.1).",
        );
    }
    // Every placeholder must be known, or a partner could sign text with a gap.
    fillAgreement(
      input.bodyMarkdown,
      agreementValues({
        version: input.version,
        publishedAt: null,
        bodySha256: "0".repeat(64),
        terms: {
          label: "check",
          effective_from: new Date().toISOString(),
          bonus_amount_pence: null,
          bonus_tiers: null,
          bonus_end_date: null,
        },
        settings: { launchDate: null, noticeEmail: null },
      }),
    );
    const now = new Date().toISOString();
    const body = input.bodyMarkdown.replace(/\r/g, "");
    const actor = (context as Ctx).userId;
    const cur = await currentVersion(db);
    check(
      await db.from("partner_agreement_versions").insert({
        version: input.version,
        status: cur ? "draft" : "current",
        published_at: now,
        effective_from: input.effectiveFrom,
        body_markdown: body,
        body_sha256: await sha256Hex(body),
        reduces_terms: input.reducesTerms,
        notice_sent_at: input.noticeSentAt,
        created_by: actor,
      }),
    );
    await logPartnerEvent(db, {
      actor,
      action: "agreement_version_published",
      details: { version: input.version, effective_from: input.effectiveFrom },
    });
    await switchVersions(db);
    return { ok: true };
  });

/**
 * Makes the newest published version whose date has come the current one,
 * retiring the one before. Called on publish and by the daily clean-up.
 */
export async function switchVersions(db: import("./partner-data.server").AnyDb) {
  const now = new Date().toISOString();
  const { data: due } = await db
    .from("partner_agreement_versions")
    .select("id, version")
    .eq("status", "draft")
    .not("published_at", "is", null)
    .lte("effective_from", now)
    .order("effective_from", { ascending: false })
    .limit(1);
  const next = ((due ?? [])[0] ?? null) as { id: string; version: string } | null;
  if (!next) return;
  await db.from("partner_agreement_versions").update({ status: "retired" }).eq("status", "current");
  await db.from("partner_agreement_versions").update({ status: "current" }).eq("id", next.id);
}
