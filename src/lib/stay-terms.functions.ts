/* eslint-disable @typescript-eslint/no-explicit-any -- stay_agreements and stay_agreement_links are from migration 0081 */
/**
 * Terms for direct stays (rules in src/lib/stay-terms.ts): the text a guest
 * sees before booking, signing from a host's link for a stay booked another
 * way, and the host's view of what each guest accepted or signed.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hostOfProperty, requireWrite } from "./roles";
import { PURPOSES, addressProblem, allTicked, type HomeAddress, type Purpose } from "./stay-terms";

const uuid = z.string().uuid();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const address = z.object({
  line1: z.string().max(120),
  line2: z.string().max(120),
  city: z.string().max(80),
  postcode: z.string().max(20),
  country: z.string().max(2),
});
const purpose = z.enum(PURPOSES as unknown as [Purpose, ...Purpose[]]);
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const signature = z
  .string()
  .max(400_000)
  .regex(/^data:image\/png;base64,/);

const srv = () => import("./stay-terms.server");

/** The terms (and licence) for the stay being booked on the property's page, exactly as they'll be kept. */
export const previewStayTerms = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(2).max(60),
        roomIds: z.array(uuid).min(1).max(6),
        checkIn: iso,
        checkOut: iso,
        guests: z.number().int().min(1).max(20),
        plan: z.enum(["flex", "nonref"]),
        name: z.string().max(120),
        homeAddress: address.nullable(),
        purpose: purpose.nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, termsProperty, directTermsInput, renderTerms } = await srv();
    const db = await admin();
    const p = await termsProperty(db, { code: data.code });
    if (!p || p.active === false) throw new Error("This page isn't taking bookings.");
    const r = await renderTerms(p, await directTermsInput(db, p, data));
    return {
      termsText: r.termsText,
      termsSha: r.termsSha,
      licenceText: r.licenceText,
      licenceSha: r.licenceSha,
      tooLong: r.tooLong,
      maxNights: r.terms.maxNights,
      licenceFrom: r.terms.licenceFrom,
    };
  });

/** What a guest agreed to on the booking page, sent with the booking (reserveDirect). */
export const agreedInput = z.object({
  termsSha: sha,
  ticks: z.array(z.string().max(20)).max(10),
  licence: z
    .object({
      sha,
      homeAddress: address,
      purpose,
      typedName: z.string().min(2).max(120),
      signature,
    })
    .nullable(),
});
export type Agreed = z.infer<typeof agreedInput>;

/**
 * Checks what the guest agreed to against the terms as they are now, before
 * the booking is made: the same text (or they're asked to read it again),
 * every box ticked, and for a licence a real home address and a signature.
 */
export async function checkAgreed(
  p: import("./stay-terms.server").TermsProperty,
  input: import("./stay-terms.server").RenderInput,
  agreed: Agreed,
  opts: { allowLong?: boolean } = {},
) {
  const { renderTerms } = await srv();
  const r = await renderTerms(p, {
    ...input,
    homeAddress: agreed.licence?.homeAddress ?? null,
    purpose: agreed.licence?.purpose ?? null,
  });
  if (r.tooLong && !opts.allowLong)
    throw new Error(
      `Stays here can be booked for up to ${r.terms.maxNights} nights. For longer, please send the host a request.`,
    );
  if (agreed.termsSha !== r.termsSha)
    throw new Error("The booking terms have just changed. Please read them again before booking.");
  if (!allTicked(!!r.licenceText, agreed.ticks)) throw new Error("Please tick each box to agree.");
  if (r.licenceText) {
    if (!agreed.licence) throw new Error("Please sign the agreement for a longer stay.");
    const problem = addressProblem(agreed.licence.homeAddress, p.postcode);
    if (problem) throw new Error(problem);
    if (agreed.licence.sha !== r.licenceSha)
      throw new Error("The agreement has just changed. Please read it again before signing.");
  }
  return r;
}

/* --------------------------- signing from a link --------------------------- */

async function linkStay(token: string) {
  const { admin, termsProperty } = await srv();
  const { sha256 } = await import("./checkin.server");
  const db = await admin();
  const { data: link } = await db
    .from("stay_agreement_links")
    .select("id, booking_id, property_id, expires_at, used_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!link || Date.parse(link.expires_at) < Date.now()) return null;
  const { data: b } = await db
    .from("bookings")
    .select(
      "id, guest_full_name, guest_email, guest_phone, check_in_date, check_out_date, check_in_time, check_out_time, guest_count, stay_amount_pence, reservation_code, status, rooms(display_name, public_title)",
    )
    .eq("id", link.booking_id)
    .maybeSingle();
  const p = await termsProperty(db, { id: link.property_id });
  if (!b || !p || b.status === "cancelled") return null;
  return { db, link, b, p };
}

function linkInput(b: any, p: any, name: string, home?: HomeAddress | null, why?: Purpose | null) {
  return {
    rooms: [b.rooms?.public_title || b.rooms?.display_name || "Your room"],
    guestName: name || b.guest_full_name || "",
    checkIn: b.check_in_date,
    checkOut: b.check_out_date,
    nights: Math.max(
      1,
      Math.round((Date.parse(b.check_out_date) - Date.parse(b.check_in_date)) / 86_400_000),
    ),
    guests: Math.max(1, b.guest_count ?? 1),
    plan: null,
    freeUntil: null,
    total:
      typeof b.stay_amount_pence === "number" && b.stay_amount_pence > 0
        ? new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: p.currency || "GBP",
          }).format(b.stay_amount_pence / 100)
        : "",
    homeAddress: home ?? null,
    purpose: why ?? null,
    checkInFrom: b.check_in_time,
    checkOutBy: b.check_out_time,
  };
}

/** The guest's signing page (/agree/<token>): their stay and the terms to read. */
export const getAgreementLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(20).max(80),
        name: z.string().max(120).optional(),
        homeAddress: address.nullable().optional(),
        purpose: purpose.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = await linkStay(data.token);
    if (!s) return { found: false as const };
    const { renderTerms } = await srv();
    const name = data.name ?? s.b.guest_full_name ?? "";
    const r = await renderTerms(
      s.p,
      linkInput(s.b, s.p, name, data.homeAddress ?? null, data.purpose ?? null),
    );
    const { normaliseTheme } = await import("./theme");
    const { data: theme } = await s.db
      .from("properties")
      .select("theme_config")
      .eq("id", s.p.id)
      .maybeSingle();
    return {
      found: true as const,
      signed: !!s.link.used_at,
      property: s.p.name,
      theme: normaliseTheme(theme?.theme_config),
      guestName: (s.b.guest_full_name as string | null) ?? "",
      country: s.p.country_code ?? "GB",
      termsText: r.termsText,
      termsSha: r.termsSha,
      licenceText: r.licenceText,
      licenceSha: r.licenceSha,
    };
  });

export const signAgreementLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(20).max(80),
        name: z.string().min(2).max(120),
        agreed: agreedInput,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = await linkStay(data.token);
    if (!s) throw new Error("This link has expired. Please ask your host for a new one.");
    if (s.link.used_at) return { ok: true };
    // A host's own booking may be longer than the booking page allows: that's the host's choice.
    const final = await checkAgreed(s.p, linkInput(s.b, s.p, data.name), data.agreed, {
      allowLong: true,
    });
    const { recordAcceptance, requestMeta } = await srv();
    const meta = await requestMeta();
    const base = {
      hostId: s.p.host_id,
      propertyId: s.p.id,
      propertyName: s.p.name,
      bookingId: s.b.id,
      reservationId: null,
      reference: (s.b.reservation_code as string | null) ?? null,
      guestName: data.name.trim(),
      guestEmail: (s.b.guest_email as string | null) ?? null,
      guestPhone: (s.b.guest_phone as string | null) ?? null,
      checkIn: s.b.check_in_date,
      checkOut: s.b.check_out_date,
      nights: linkInput(s.b, s.p, data.name).nights,
      ticks: data.agreed.ticks,
      ...meta,
      demo: !!s.p.is_demo,
    };
    await recordAcceptance({
      ...base,
      kind: "terms",
      text: final.termsText,
      sha: final.termsSha,
    });
    if (final.licenceText && final.licenceSha && data.agreed.licence)
      await recordAcceptance({
        ...base,
        kind: "licence",
        text: final.licenceText,
        sha: final.licenceSha,
        homeAddress: data.agreed.licence.homeAddress,
        purpose: data.agreed.licence.purpose,
        typedName: data.agreed.licence.typedName,
        signature: data.agreed.licence.signature,
      });
    await s.db
      .from("stay_agreement_links")
      .update({ used_at: new Date().toISOString() })
      .eq("id", s.link.id);
    return { ok: true };
  });

/* ------------------------------- the host ------------------------------- */

/** A link for the guest to read and sign the terms for a stay booked another way (14 days). */
export const createAgreementLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = await srv();
    const db = await admin();
    const { data: b } = await db
      .from("bookings")
      .select("id, property_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("Booking not found.");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));
    const { newToken } = await import("./checkin.server");
    const t = newToken();
    const { data: u } = await context.supabase.auth.getUser();
    const { error } = await db.from("stay_agreement_links").insert({
      token_hash: t.hash,
      booking_id: b.id,
      property_id: b.property_id,
      created_by: u.user?.id ?? null,
      expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    });
    if (error) throw new Error("Stay terms need the latest update (migration 0081).");
    const { publicOrigin } = await import("./integrations.server");
    return { url: `${publicOrigin()}/agree/${t.token}` };
  });

/** What the guest of a stay accepted or signed, with 10-minute links to the PDFs. */
export const listStayAgreements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    // Read as the signed-in host: only owners and managers see private records.
    const sb = context.supabase as unknown as { from: (t: string) => any };
    const { data: b } = await sb
      .from("bookings")
      .select("reservation_code, property_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    let q = sb
      .from("stay_agreements")
      .select(
        "id, property_id, kind, version, guest_name, signed_at, home_address, purpose, typed_name, pdf_path, rendered_sha256, check_in, check_out, nights",
      )
      .order("signed_at", { ascending: false });
    q = b?.reservation_code
      ? // The other rooms of the same booking share its reference (same property only).
        q.or(
          `booking_id.eq.${data.bookingId},and(reference.eq.${b.reservation_code},property_id.eq.${b.property_id})`,
        )
      : q.eq("booking_id", data.bookingId);
    const { data: rows, error } = await q;
    if (error) return { available: false as const, items: [] };
    const list = (rows ?? []) as any[];
    // A PDF that couldn't be made at the time is made now; a demo property's is made to open, never stored.
    const { storeFiles, pdfDataUrl, admin } = await srv();
    const propIds = [...new Set(list.map((r) => r.property_id).filter(Boolean))];
    const { data: props } = propIds.length
      ? await (await admin()).from("properties").select("id, is_demo").in("id", propIds)
      : { data: [] };
    const demoProps = new Set(
      ((props ?? []) as any[]).filter((x) => x.is_demo).map((x) => x.id as string),
    );
    const demoPdf: Record<string, string | null> = {};
    for (const r of list.filter((x) => !x.pdf_path)) {
      if (demoProps.has(r.property_id)) demoPdf[r.id] = await pdfDataUrl(r.id).catch(() => null);
      else await storeFiles(r.id).catch(() => undefined);
    }
    const { signPrivateLinks } = await import("./private-store.server");
    const { data: again } = await sb
      .from("stay_agreements")
      .select("id, pdf_path")
      .in(
        "id",
        list.map((r) => r.id),
      );
    const paths = Object.fromEntries(((again ?? []) as any[]).map((r) => [r.id, r.pdf_path]));
    const links = await signPrivateLinks(Object.values(paths), 600, "agreement.pdf");
    return {
      available: true as const,
      items: list.map((r) => ({
        id: r.id as string,
        kind: r.kind as "terms" | "licence",
        version: r.version as string,
        guestName: r.guest_name as string,
        signedAt: r.signed_at as string,
        homeAddress: (r.home_address as HomeAddress | null) ?? null,
        purpose: (r.purpose as Purpose | null) ?? null,
        typedName: (r.typed_name as string | null) ?? null,
        sha: r.rendered_sha256 as string,
        nights: r.nights as number,
        pdf: paths[r.id] ? (links[paths[r.id]] ?? null) : (demoPdf[r.id] ?? null),
      })),
    };
  });
