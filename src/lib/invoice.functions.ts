/**
 * Invoices for direct stays. Nothing is generated until someone asks: the
 * guest from their guest guide (who may correct their email and postal
 * address once, after which it's locked to them), or the host from the guest
 * card (who can create one on demand and amend it any time). Each invoice
 * has a private link that opens a printable page.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { formatUkDate, nightsBetween } from "@/lib/dates";
import {
  cleanGuestDetails,
  invoiceNumber,
  invoiceOffered,
  invoiceTotals,
  stayDescription,
  suggestPrefix,
  taxTerms,
} from "@/lib/invoice";
import { hostOfProperty, requireOwner, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const token = z.string().min(20).max(80);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Draft = {
  hostId: string;
  propertyId: string;
  bookingId: string;
  offered: boolean;
  currency: string;
  title: string;
  sellerName: string;
  sellerRoom: string | null;
  sellerAddress: string | null;
  taxLabel: string | null;
  taxNumber: string | null;
  taxName: string;
  registered: boolean;
  rateBp: number;
  buyerName: string;
  buyerEmail: string | null;
  description: string;
  checkIn: string;
  checkOut: string;
  amountPence: number;
  includesTax: boolean;
  prefix: string;
};

/** Everything an invoice for this stay would say, from the stay, room, property and business. */
async function draftFor(bookingId: string): Promise<Draft | null> {
  const db = await admin();
  const { data: b } = await db
    .from("bookings")
    .select(
      "id, channel, guest_full_name, guest_email, check_in_date, check_out_date, stay_amount_pence, stay_amount_includes_tax, property_id, rooms(display_name, public_title), properties(id, name, address, postcode, country_code, host_id, hosts(business_name, currency, tax_registered, tax_label, tax_rate_bp, prices_include_tax, tax_number, invoice_prefix, invoices_enabled))",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return null;
  const room = (b as { rooms?: { display_name: string; public_title: string | null } | null }).rooms;
  const p = (b as unknown as {
    properties: {
      id: string;
      name: string;
      address: string | null;
      postcode: string | null;
      country_code: string | null;
      host_id: string;
      hosts: {
        business_name: string;
        currency: string;
        tax_registered: boolean;
        tax_label: string | null;
        tax_rate_bp: number | null;
        prices_include_tax: boolean | null;
        tax_number: string | null;
        invoice_prefix: string | null;
        invoices_enabled: boolean | null;
      } | null;
    } | null;
  }).properties;
  if (!p) return null;
  const h = p.hosts;
  const terms = taxTerms(p.country_code);
  const registered = !!h?.tax_registered;
  const roomName = room?.public_title || room?.display_name || null;
  return {
    hostId: p.host_id,
    propertyId: p.id,
    bookingId: b.id,
    offered: invoiceOffered(b, !!h?.invoices_enabled),
    currency: h?.currency ?? "GBP",
    title: registered ? terms.title : "Invoice",
    sellerName: p.name,
    sellerRoom: roomName,
    sellerAddress: [p.address, p.postcode].filter(Boolean).join("\n") || null,
    taxLabel: registered && h?.tax_number ? (h.tax_label ? `${h.tax_label} number` : terms.numberLabel) : null,
    taxNumber: registered ? (h?.tax_number ?? null) : null,
    taxName: h?.tax_label || terms.name,
    registered,
    rateBp: h?.tax_rate_bp ?? 0,
    buyerName: b.guest_full_name?.trim() || "Guest",
    buyerEmail: b.guest_email ?? null,
    description: stayDescription(
      roomName,
      nightsBetween(b.check_in_date, b.check_out_date),
      formatUkDate(b.check_in_date, { withYear: true }),
      formatUkDate(b.check_out_date, { withYear: true }),
    ),
    checkIn: b.check_in_date,
    checkOut: b.check_out_date,
    amountPence: b.stay_amount_pence ?? 0,
    includesTax: b.stay_amount_includes_tax ?? h?.prices_include_tax ?? true,
    prefix: h?.invoice_prefix && h.invoice_prefix !== "INV" ? h.invoice_prefix : suggestPrefix(h?.business_name),
  };
}

type Edits = {
  sellerName?: string;
  sellerRoom?: string | null;
  sellerAddress?: string | null;
  buyerName?: string;
  buyerEmail?: string | null;
  buyerAddress?: string | null;
  description?: string;
  amountPence?: number;
  includesTax?: boolean;
};

function fieldsFrom(d: Draft, e: Edits) {
  const totals = invoiceTotals({
    amountPence: e.amountPence ?? d.amountPence,
    includesTax: e.includesTax ?? d.includesTax,
    registered: d.registered,
    rateBp: d.rateBp,
  });
  return {
    title: d.title,
    seller_name: (e.sellerName ?? d.sellerName).trim().slice(0, 200),
    seller_room: (e.sellerRoom === undefined ? d.sellerRoom : e.sellerRoom)?.trim().slice(0, 120) || null,
    seller_address: (e.sellerAddress === undefined ? d.sellerAddress : e.sellerAddress)?.trim().slice(0, 400) || null,
    seller_tax_label: d.taxLabel,
    seller_tax_number: d.taxNumber,
    buyer_name: (e.buyerName ?? d.buyerName).trim().slice(0, 200) || "Guest",
    buyer_email: (e.buyerEmail === undefined ? d.buyerEmail : e.buyerEmail)?.trim() || null,
    buyer_address: e.buyerAddress?.trim() || null,
    description: (e.description ?? d.description).trim().slice(0, 300),
    check_in_date: d.checkIn,
    check_out_date: d.checkOut,
    currency: d.currency,
    tax_name: totals.tax > 0 ? d.taxName : null,
    tax_rate_bp: totals.rateBp,
    net_pence: totals.net,
    tax_pence: totals.tax,
    total_pence: totals.total,
  };
}

/** Creates the invoice with the next number in the business's sequence. */
async function createInvoice(d: Draft, e: Edits, by: "guest" | "host") {
  const db = await admin();
  const { data: n, error: numErr } = await db.rpc("claim_invoice_number", { _host_id: d.hostId });
  if (numErr || typeof n !== "number") throw new Error("We couldn't number the invoice. Please try again.");
  const { randomBytes } = await import("crypto");
  const row = {
    ...fieldsFrom(d, e),
    host_id: d.hostId,
    property_id: d.propertyId,
    booking_id: d.bookingId,
    number: invoiceNumber(d.prefix, n),
    issued_on: new Date().toISOString().slice(0, 10),
    access_token: randomBytes(24).toString("base64url"),
    created_by: by,
    guest_locked_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("invoices").insert(row).select("access_token").single();
  if (error) {
    // Someone created it at the same moment: theirs stands.
    const { data: existing } = await db.from("invoices").select("access_token").eq("booking_id", d.bookingId).maybeSingle();
    if (existing) return existing.access_token;
    throw new Error("We couldn't create the invoice. Please try again.");
  }
  return data.access_token;
}

/* -------------------------------- guests -------------------------------- */

/** The stay behind a guest guide link, if it's open. */
async function stayFromGuideToken(t: string): Promise<string | null> {
  const { sha256 } = await import("./checkin.server");
  const db = await admin();
  const { data } = await db
    .from("stay_tokens")
    .select("booking_id, expires_at, valid_from")
    .eq("token_hash", sha256(t))
    .maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) return null;
  if (data.valid_from && Date.parse(data.valid_from) > Date.now()) return null;
  return data.booking_id;
}

/** What the guest guide shows: nothing, a form to create the invoice, or the invoice. */
export const getStayInvoice = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const bookingId = await stayFromGuideToken(data.token);
    if (!bookingId) return { offered: false as const };
    let d: Draft | null;
    try {
      d = await draftFor(bookingId);
    } catch {
      return { offered: false as const }; // Before migration 0023.
    }
    if (!d?.offered) return { offered: false as const };
    const db = await admin();
    const { data: inv } = await db
      .from("invoices")
      .select("access_token, number, total_pence, currency, buyer_email")
      .eq("booking_id", bookingId)
      .maybeSingle();
    return {
      offered: true as const,
      invoice: inv
        ? { token: inv.access_token, number: inv.number, total: inv.total_pence, currency: inv.currency, email: inv.buyer_email }
        : null,
      draft: { buyerName: d.buyerName, buyerEmail: d.buyerEmail },
    };
  });

/** The guest creates their invoice, optionally correcting email and postal address first. */
export const createStayInvoice = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({ token, email: z.string().max(300).nullish(), address: z.string().max(600).nullish() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const bookingId = await stayFromGuideToken(data.token);
    if (!bookingId) throw new Error("This guest guide link has expired.");
    const d = await draftFor(bookingId);
    if (!d?.offered) throw new Error("Invoices aren't available for this stay.");
    const db = await admin();
    const { data: existing } = await db.from("invoices").select("access_token").eq("booking_id", bookingId).maybeSingle();
    // Once made, it's locked to the guest; the host can still change it.
    if (existing) return { token: existing.access_token };
    const clean = cleanGuestDetails({ email: data.email ?? d.buyerEmail, address: data.address ?? null });
    if (!clean.ok) throw new Error(clean.problem === "email" ? "Please check the email address." : "That address is too long.");
    return { token: await createInvoice(d, { buyerEmail: clean.email, buyerAddress: clean.address }, "guest") };
  });

/** The printable invoice behind its private link. */
export const getInvoice = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(24).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: inv } = await db
      .from("invoices")
      .select(
        "number, issued_on, title, seller_name, seller_room, seller_address, seller_tax_label, seller_tax_number, buyer_name, buyer_email, buyer_address, description, check_in_date, check_out_date, currency, tax_name, tax_rate_bp, net_pence, tax_pence, total_pence, amended_at",
      )
      .eq("access_token", data.token)
      .maybeSingle();
    return inv ? { found: true as const, invoice: inv } : { found: false as const };
  });

/* --------------------------------- hosts --------------------------------- */

/** The guest card: the stay's invoice, or what a new one would say. */
export const getBookingInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: the caller must be able to see the stay.
    const { data: visible } = await context.supabase.from("bookings").select("id").eq("id", data.bookingId).maybeSingle();
    if (!visible) throw new Error("We couldn't find that stay.");
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("booking_id", data.bookingId)
      .maybeSingle();
    if (error) return { available: false as const };
    const d = await draftFor(data.bookingId);
    if (!d) return { available: false as const };
    return { available: true as const, invoice: inv, draft: d };
  });

const hostEdits = z.object({
  sellerName: z.string().trim().min(1).max(200),
  sellerRoom: z.string().max(120).nullable(),
  sellerAddress: z.string().max(400).nullable(),
  buyerName: z.string().trim().min(1).max(200),
  buyerEmail: z.string().max(254).nullable(),
  buyerAddress: z.string().max(400).nullable(),
  description: z.string().trim().min(1).max(300),
  amountPence: z.number().int().min(0).max(100_000_000),
  includesTax: z.boolean(),
});

/** Creates the stay's invoice on demand, or amends the one that exists. */
export const saveBookingInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid, edits: hostEdits }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const { data: b } = await context.supabase.from("bookings").select("property_id").eq("id", data.bookingId).maybeSingle();
    if (!b) throw new Error("We couldn't find that stay.");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));
    const email = cleanGuestDetails({ email: data.edits.buyerEmail, address: data.edits.buyerAddress });
    if (!email.ok) throw new Error(email.problem === "email" ? "Please check the guest's email address." : "That address is too long.");
    const d = await draftFor(data.bookingId);
    if (!d) throw new Error("We couldn't find that stay.");
    const edits = { ...data.edits, buyerEmail: email.email, buyerAddress: email.address };
    const db = await admin();
    const { data: existing } = await db.from("invoices").select("id, access_token").eq("booking_id", data.bookingId).maybeSingle();
    if (!existing) return { token: await createInvoice(d, edits, "host") };
    const { error } = await db
      .from("invoices")
      .update({ ...fieldsFrom(d, edits), amended_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { token: existing.access_token };
  });

/** Settings: invoices on or off, the tax number and the number prefix. */
export const saveInvoiceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid,
        enabled: z.boolean(),
        taxNumber: z.string().trim().max(40),
        prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,12}$/, "Letters, numbers and dashes only, up to 12."),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    const { error } = await context.supabase
      .from("hosts")
      .update({ invoices_enabled: data.enabled, tax_number: data.taxNumber || null, invoice_prefix: data.prefix })
      .eq("id", data.hostId);
    if (error) throw new Error("Couldn't save your invoice settings.");
    return { ok: true };
  });

export const getInvoiceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: h, error } = await context.supabase
      .from("hosts")
      .select("business_name, invoices_enabled, tax_number, invoice_prefix, tax_registered, tax_label, tax_rate_bp, prices_include_tax")
      .eq("id", data.hostId)
      .single();
    if (error) return { available: false as const };
    const { data: p } = await context.supabase
      .from("properties")
      .select("country_code")
      .eq("host_id", data.hostId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return {
      available: true as const,
      enabled: h.invoices_enabled,
      taxNumber: h.tax_number ?? "",
      prefix: h.invoice_prefix && h.invoice_prefix !== "INV" ? h.invoice_prefix : suggestPrefix(h.business_name),
      registered: h.tax_registered,
      taxLabel: h.tax_label,
      rateBp: h.tax_rate_bp,
      pricesInclude: h.prices_include_tax,
      terms: taxTerms(p?.country_code),
    };
  });
