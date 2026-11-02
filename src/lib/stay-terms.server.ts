/* eslint-disable @typescript-eslint/no-explicit-any -- stay_agreements is from migration 0081, newer than the generated types */
/**
 * Server only: the booking terms and longer-stay licence for a direct stay,
 * rendered from the property's settings (so the text a guest sees, signs and
 * is kept is the same text), and the record of acceptance (stay_agreements:
 * the exact text, its fingerprint, the ticks and declarations, when, from
 * where, and the signature and PDF in the private store).
 */
import {
  bookingTermsText,
  cancellationText,
  keyPoints,
  licenceText,
  needsLicence,
  normaliseStayTerms,
  PURPOSE_LABELS,
  addressLine,
  textSha256,
  tooLong,
  type HomeAddress,
  type Purpose,
  type StayTerms,
  type TermsContext,
} from "./stay-terms";

type Loose = { from: (t: string) => any };

export async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export type TermsProperty = {
  id: string;
  host_id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  country_code: string | null;
  default_check_in_time: string | null;
  default_check_out_time: string | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  direct_booking: unknown;
  direct_offers?: unknown;
  short_code?: string;
  active?: boolean | null;
  /** A demo property: records last a couple of days and no files are stored. */
  is_demo?: boolean | null;
  timezone?: string | null;
  currency?: string | null;
  business: string;
};

export async function termsProperty(
  db: Loose,
  by: { id: string } | { code: string },
): Promise<TermsProperty | null> {
  const q = db
    .from("properties")
    .select(
      "id, host_id, name, short_code, active, is_demo, address, postcode, country_code, timezone, currency, default_check_in_time, default_check_out_time, quiet_hours_start, quiet_hours_end, direct_booking, direct_offers, hosts(business_name, currency)",
    );
  const { data } = await (
    "id" in by ? q.eq("id", by.id) : q.eq("short_code", by.code.toLowerCase())
  ).maybeSingle();
  if (!data) return null;
  return {
    ...data,
    currency: data.currency || data.hosts?.currency || "GBP",
    business: (data.hosts?.business_name as string | null) || data.name,
  };
}

export const stayTermsOf = (p: Pick<TermsProperty, "direct_booking">): StayTerms =>
  normaliseStayTerms((p.direct_booking as { terms?: unknown } | null)?.terms);

export const money = (pence: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(pence / 100);

export type RenderInput = {
  rooms: string[];
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  plan: "flex" | "nonref" | null;
  freeUntil: string | null;
  total: string;
  homeAddress?: HomeAddress | null;
  purpose?: Purpose | null;
  /** The stay's own times, when set (an extension or early arrival). */
  checkInFrom?: string | null;
  checkOutBy?: string | null;
};

/** The terms (and licence, when the stay is long enough), exactly as shown and kept. */
export async function renderTerms(p: TermsProperty, i: RenderInput) {
  const terms = stayTermsOf(p);
  const t = (v: string | null | undefined, d: string) => (v ?? d).slice(0, 5);
  const ctx: TermsContext = {
    host: p.business,
    property: p.name,
    propertyAddress: [p.address, p.postcode].filter(Boolean).join(", ") || null,
    country: p.country_code,
    rooms: i.rooms,
    guestName: i.guestName.trim() || "the guest",
    checkIn: i.checkIn,
    checkOut: i.checkOut,
    nights: i.nights,
    guests: i.guests,
    checkInFrom: t(i.checkInFrom ?? p.default_check_in_time, "15:00"),
    checkOutBy: t(i.checkOutBy ?? p.default_check_out_time, "11:00"),
    quietHours:
      p.quiet_hours_start && p.quiet_hours_end
        ? `${p.quiet_hours_start.slice(0, 5)} to ${p.quiet_hours_end.slice(0, 5)}`
        : null,
    cancellation: cancellationText({ plan: i.plan, freeUntil: i.freeUntil }),
    total: i.total,
    terms,
    homeAddress: i.homeAddress ?? null,
    purpose: i.purpose ?? null,
  };
  const termsText = bookingTermsText(ctx);
  const licence = needsLicence(terms, i.nights) ? licenceText(ctx) : null;
  return {
    terms,
    tooLong: tooLong(terms, i.nights),
    termsText,
    termsSha: await textSha256(termsText),
    licenceText: licence,
    licenceSha: licence ? await textSha256(licence) : null,
    keyPoints: licence ? keyPoints(ctx) : [],
  };
}

/** Six years after check-out: long enough for a claim about the stay in the UK courts. */
export function keepUntil(checkOut: string): string {
  const d = new Date(`${checkOut}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 6);
  return d.toISOString().slice(0, 10);
}

export type Acceptance = {
  hostId: string;
  propertyId: string;
  propertyName: string;
  bookingId: string | null;
  reservationId: string | null;
  reference: string | null;
  kind: "terms" | "licence";
  text: string;
  sha: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  homeAddress?: HomeAddress | null;
  purpose?: Purpose | null;
  ticks: string[];
  typedName?: string | null;
  /** A drawn signature, as a PNG data URL. */
  signature?: string | null;
  ip: string | null;
  userAgent: string | null;
  /** A demo property's (shared demo, showcase, recording): kept two days, nothing stored in Drive. */
  demo?: boolean;
  /** A card booking not yet paid: the PDF waits for the payment (agreementsPaid). */
  awaitingPayment?: boolean;
};

/** Demo records go with the next daily reset. */
const demoKeep = () => new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

/**
 * Keeps one acceptance: the row first (so it's never lost), then the drawn
 * signature and the PDF in the business's restricted folder. A PDF that
 * can't be made now is made again from the record (storeFiles) when the
 * host opens it.
 */
export async function recordAcceptance(a: Acceptance): Promise<string> {
  const db = await admin();
  const signedAt = new Date().toISOString();
  const { data: row, error } = await db
    .from("stay_agreements")
    .insert({
      host_id: a.hostId,
      property_id: a.propertyId,
      booking_id: a.bookingId,
      reservation_id: a.reservationId,
      reference: a.reference,
      kind: a.kind,
      version: (await import("./stay-terms")).STAY_TERMS_VERSION,
      rendered_text: a.text,
      rendered_sha256: a.sha,
      property_name: a.propertyName,
      guest_name: a.guestName,
      guest_email: a.guestEmail,
      guest_phone: a.guestPhone,
      check_in: a.checkIn,
      check_out: a.checkOut,
      nights: a.nights,
      home_address: a.homeAddress ?? null,
      purpose: a.purpose ?? null,
      ticks: a.ticks,
      typed_name: a.typedName ?? null,
      signed_at: signedAt,
      ip: a.ip,
      user_agent: a.userAgent?.slice(0, 500) ?? null,
      keep_until: a.demo ? demoKeep() : keepUntil(a.checkOut),
    })
    .select("id")
    .single();
  if (error || !row) throw new Error("Your agreement couldn't be saved. Please try again.");
  if (!a.demo)
    await storeFiles(row.id, a.signature ?? null, { pdf: !a.awaitingPayment }).catch((e: unknown) =>
      console.error("Stay agreement files", e instanceof Error ? e.message : e),
    );
  return row.id as string;
}

/** The signature and PDF for a record (again, if they weren't stored the first time). */
export async function storeFiles(
  id: string,
  signature?: string | null,
  opts: { pdf?: boolean } = {},
): Promise<void> {
  const db = await admin();
  const { data: r } = await db.from("stay_agreements").select("*").eq("id", id).single();
  if (!r || r.pdf_sha256) return;
  // Demo properties never put files in Drive (their PDFs are made when opened).
  if (r.property_id) {
    const { data: prop } = await db
      .from("properties")
      .select("is_demo")
      .eq("id", r.property_id)
      .maybeSingle();
    if (prop?.is_demo) return;
  }
  const { storePrivate, readPrivate } = await import("./private-store.server");
  const { sha256OfBytes } = await import("./private-store");
  const { data: host } = await db
    .from("hosts")
    .select("business_name")
    .eq("id", r.host_id)
    .maybeSingle();
  const owner = {
    ownerKey: r.host_id as string,
    ownerLabel: (host?.business_name as string | null) ?? "Business",
  };
  let png: Uint8Array | null = null;
  const sig = signature ?? null;
  if (sig && !r.signature_path) {
    png = Uint8Array.from(atob(sig.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
    const ref = await storePrivate({
      ...owner,
      kind: "stay_signature",
      name: `signature-${id}.png`,
      mime: "image/png",
      bytes: png,
      ref: { table: "stay_agreements", column: "signature_path" },
    });
    await db.from("stay_agreements").update({ signature_path: ref }).eq("id", id);
  } else if (r.signature_path) {
    png = await readPrivate(r.signature_path)
      .then((f) => f?.bytes ?? null)
      .catch(() => null);
  }
  if (opts.pdf === false) return;
  const { stayAgreementPdf } = await import("./stay-terms-pdf.server");
  const pdf = await stayAgreementPdf(r.rendered_text, {
    id,
    kind: r.kind,
    version: r.version,
    property: r.property_name,
    reference: r.reference,
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    guestPhone: r.guest_phone,
    renderedSha256: r.rendered_sha256,
    ticks: r.ticks ?? [],
    homeAddress: r.home_address ? addressLine(r.home_address as HomeAddress) : null,
    purpose: r.purpose ? (PURPOSE_LABELS[r.purpose as Purpose] ?? r.purpose) : null,
    typedName: r.typed_name,
    signedAt: r.signed_at,
    ip: r.ip,
    userAgent: r.user_agent,
    signaturePng: png,
  });
  const pdfRef = await storePrivate({
    ...owner,
    kind: "stay_agreement",
    name: `${r.kind === "licence" ? "licence" : "booking-terms"}-${r.reference ?? id}.pdf`,
    mime: "application/pdf",
    bytes: pdf,
    ref: { table: "stay_agreements", column: "pdf_path" },
  });
  await db
    .from("stay_agreements")
    .update({ pdf_path: pdfRef, pdf_sha256: await sha256OfBytes(pdf) })
    .eq("id", id);
}

/** A card booking was paid: its agreements' PDFs are made now. */
export async function agreementsPaid(reservationId: string): Promise<void> {
  const db = await admin();
  const { data } = await db
    .from("stay_agreements")
    .select("id")
    .eq("reservation_id", reservationId)
    .is("pdf_sha256", null);
  for (const r of (data ?? []) as Array<{ id: string }>)
    await storeFiles(r.id).catch((e: unknown) =>
      console.error("Stay agreement files", e instanceof Error ? e.message : e),
    );
}

/**
 * A booking that never went ahead (the card checkout ran out, or saving
 * failed): nothing was agreed in the end, so its records and files go.
 */
export async function dropAgreements(reservationId: string): Promise<void> {
  const db = await admin();
  const { data } = await db
    .from("stay_agreements")
    .select("id, signature_path, pdf_path")
    .eq("reservation_id", reservationId);
  const rows = (data ?? []) as Array<{
    id: string;
    signature_path: string | null;
    pdf_path: string | null;
  }>;
  if (!rows.length) return;
  const { removePrivate } = await import("./private-store.server");
  await removePrivate(rows.flatMap((r) => [r.signature_path, r.pdf_path])).catch(() => undefined);
  await db
    .from("stay_agreements")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
}

/** Who's asking: their IP address and browser, from the request. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { requestIp } = await import("./ip-hash.server");
  const h = getRequest().headers;
  return { ip: requestIp(h) ?? null, userAgent: h.get("user-agent") };
}

/**
 * A stay booked on the property's own page: the rooms' names and the total
 * worked out the same way as the booking itself (reserveDirect), so the
 * terms shown before booking and the ones kept are word for word the same.
 */
export async function directTermsInput(
  db: Loose,
  p: TermsProperty & {
    currency?: string | null;
    direct_offers?: unknown;
    timezone?: string | null;
  },
  i: {
    roomIds: string[];
    checkIn: string;
    checkOut: string;
    guests: number;
    plan: "flex" | "nonref";
    name: string;
    homeAddress?: HomeAddress | null;
    purpose?: Purpose | null;
  },
): Promise<RenderInput> {
  const { normaliseDirectBooking, quotePlan, freeCancelUntil } = await import("./direct-booking");
  const { normaliseOffers } = await import("./direct-rates");
  const { nightsBetween } = await import("./dates");
  const settings = normaliseDirectBooking(p.direct_booking);
  const offers = normaliseOffers(p.direct_offers);
  const { data: rows } = await db
    .from("rooms")
    .select("id, display_name, public_title, base_rate_pence, property_id")
    .in("id", i.roomIds);
  const rooms = ((rows ?? []) as any[])
    .filter((r) => r.property_id === p.id)
    .sort((a, b) => i.roomIds.indexOf(a.id) - i.roomIds.indexOf(b.id));
  let total = 0;
  for (const r of rooms) {
    if (typeof r.base_rate_pence !== "number") continue;
    total +=
      quotePlan(r.base_rate_pence, i.plan, settings, offers, r.id, i.checkIn, i.checkOut)?.total ??
      0;
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: p.timezone ?? "Europe/London",
  }).format(new Date());
  return {
    rooms: rooms.map((r) => (r.public_title as string | null) || (r.display_name as string)),
    guestName: i.name,
    checkIn: i.checkIn,
    checkOut: i.checkOut,
    nights: nightsBetween(i.checkIn, i.checkOut),
    guests: i.guests,
    plan: i.plan,
    freeUntil: i.plan === "flex" ? freeCancelUntil(i.checkIn, settings, today) : null,
    total: total ? money(total, p.currency || "GBP") : "",
    homeAddress: i.homeAddress ?? null,
    purpose: i.purpose ?? null,
  };
}

/** A record's PDF made now and not stored (demo properties): as a data link to open. */
export async function pdfDataUrl(id: string): Promise<string | null> {
  const db = await admin();
  const { data: r } = await db.from("stay_agreements").select("*").eq("id", id).maybeSingle();
  if (!r) return null;
  const { stayAgreementPdf } = await import("./stay-terms-pdf.server");
  const pdf = await stayAgreementPdf(r.rendered_text, {
    id,
    kind: r.kind,
    version: r.version,
    property: r.property_name,
    reference: r.reference,
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    guestPhone: r.guest_phone,
    renderedSha256: r.rendered_sha256,
    ticks: r.ticks ?? [],
    homeAddress: r.home_address ? addressLine(r.home_address as HomeAddress) : null,
    purpose: r.purpose ? (PURPOSE_LABELS[r.purpose as Purpose] ?? r.purpose) : null,
    typedName: r.typed_name,
    signedAt: r.signed_at,
    ip: r.ip,
    userAgent: r.user_agent,
    signaturePng: null,
  });
  let bin = "";
  for (const b of pdf) bin += String.fromCharCode(b);
  return `data:application/pdf;base64,${btoa(bin)}`;
}

/**
 * Sample records for a demo property's direct stays, so the guest card's
 * Terms and agreement shows what hosts get (fictional, kept two days).
 */
export async function seedSampleAgreements(propertyId: string): Promise<void> {
  const db = await admin();
  const p = await termsProperty(db, { id: propertyId });
  if (!p?.is_demo) return;
  // A fresh set with each rebuild (a demo property's records are all samples).
  await db.from("stay_agreements").delete().eq("property_id", propertyId);
  const { data: stays } = await db
    .from("bookings")
    .select(
      "id, guest_full_name, check_in_date, check_out_date, check_in_time, check_out_time, guest_count, reservation_code, rooms(display_name, public_title)",
    )
    .eq("property_id", propertyId)
    .eq("channel", "direct")
    .not("guest_full_name", "is", null)
    .limit(3);
  const { nightsBetween } = await import("./dates");
  for (const b of (stays ?? []) as any[]) {
    const nights = Math.max(1, nightsBetween(b.check_in_date, b.check_out_date));
    const r = await renderTerms(p, {
      rooms: [b.rooms?.public_title || b.rooms?.display_name || "Room"],
      guestName: b.guest_full_name,
      checkIn: b.check_in_date,
      checkOut: b.check_out_date,
      nights,
      guests: Math.max(1, b.guest_count ?? 1),
      plan: "flex",
      freeUntil: null,
      total: "",
      checkInFrom: b.check_in_time,
      checkOutBy: b.check_out_time,
    });
    await recordAcceptance({
      hostId: p.host_id,
      propertyId: p.id,
      propertyName: p.name,
      bookingId: b.id,
      reservationId: null,
      reference: b.reservation_code ?? null,
      kind: "terms",
      text: r.termsText,
      sha: r.termsSha,
      guestName: b.guest_full_name,
      guestEmail: null,
      guestPhone: null,
      checkIn: b.check_in_date,
      checkOut: b.check_out_date,
      nights,
      ticks: ["terms"],
      ip: "198.51.100.24",
      userAgent: "Sample record for the demo",
      demo: true,
    });
  }
}
