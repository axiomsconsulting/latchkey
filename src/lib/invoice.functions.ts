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
  nightlyLines,
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
  buyerAddress: string | null;
  description: string;
  checkIn: string;
  checkOut: string;
  amountPence: number;
  includesTax: boolean;
  prefix: string;
  /** List each night on its own line (site setting); null before migration 0026. */
  nightly: boolean | null;
};

/** Everything an invoice for this stay would say, from the stay, room, property and business. */
async function draftFor(bookingId: string): Promise<Draft | null> {
  const db = await admin();
  const { data: b } = await db
    .from("bookings")
    // "*" so the guest address is picked up once migration 0030 adds it.
    .select(
      "*, rooms(display_name, public_title), properties(id, name, address, postcode, country_code, host_id, hosts(business_name, currency, tax_registered, tax_label, tax_rate_bp, prices_include_tax, tax_number, invoice_prefix, invoices_enabled))",
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
    buyerAddress: ((b as { guest_address?: string | null }).guest_address ?? null) || null,
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
    nightly: await nightlySetting(),
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

/** The super admin's choice of one line per night; null if the setting doesn't exist yet. */
async function nightlySetting(): Promise<boolean | null> {
  const db = await admin();
  const { data, error } = await (db as unknown as { from: (t: string) => any })
    .from("site_settings")
    .select("invoice_nightly_lines")
    .eq("id", 1)
    .maybeSingle();
  if (error) return null;
  return (data as { invoice_nightly_lines?: boolean } | null)?.invoice_nightly_lines !== false;
}

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
    buyer_address: (e.buyerAddress === undefined ? d.buyerAddress : e.buyerAddress)?.trim().slice(0, 400) || null,
    description: (e.description ?? d.description).trim().slice(0, 300),
    check_in_date: d.checkIn,
    check_out_date: d.checkOut,
    currency: d.currency,
    tax_name: totals.tax > 0 ? d.taxName : null,
    tax_rate_bp: totals.rateBp,
    net_pence: totals.net,
    tax_pence: totals.tax,
    total_pence: totals.total,
    // Each night's share of the price before tax; the tax line follows the total.
    ...(d.nightly === null
      ? {}
      : {
          lines: d.nightly
            ? nightlyLines(
                totals.net,
                d.checkIn,
                d.checkOut,
                (e.sellerRoom === undefined ? d.sellerRoom : e.sellerRoom)?.trim() || null,
                (iso) => formatUkDate(iso, { withYear: true }),
              )
            : null,
        }),
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
    const clean = cleanGuestDetails({ email: data.email ?? d.buyerEmail, address: data.address ?? d.buyerAddress });
    if (!clean.ok) throw new Error(clean.problem === "email" ? "Please check the email address." : "That address is too long.");
    return { token: await createInvoice(d, { buyerEmail: clean.email, buyerAddress: clean.address }, "guest") };
  });

/** The printable invoice behind its private link. */
export const getInvoice = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(24).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { withLegacy } = await import("./checkin.server");
    const cols =
      "number, issued_on, title, seller_name, seller_room, seller_address, seller_tax_label, seller_tax_number, buyer_name, buyer_email, buyer_address, description, check_in_date, check_out_date, currency, tax_name, tax_rate_bp, net_pence, tax_pence, total_pence, amended_at";
    const { data: inv } = await withLegacy(
      () => db.from("invoices").select(`${cols}, lines`).eq("access_token", data.token).maybeSingle(),
      () => db.from("invoices").select(cols).eq("access_token", data.token).maybeSingle(),
    );
    if (!inv) return { found: false as const };
    // The top of the invoice: the group's name and logo, or the property's (the host's choice, migration 0048).
    let header: { name: string; logoUrl: string | null; logoPreset: string } | null = null;
    try {
      const { data: ids } = await db.from("invoices").select("host_id, property_id").eq("access_token", data.token).maybeSingle();
      const [{ data: host }, { data: prop }] = await Promise.all([
        (db as any).from("hosts").select("business_name, group_brand").eq("id", ids?.host_id).maybeSingle(),
        ids?.property_id ? db.from("properties").select("name, theme_config").eq("id", ids.property_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const { normaliseGroupBrand, effectiveLogo } = await import("./group-brand");
      const { normaliseTheme } = await import("./theme");
      const g = normaliseGroupBrand(host?.group_brand);
      const theme = normaliseTheme((prop as { theme_config?: unknown } | null)?.theme_config);
      if (g.showOnInvoices || !prop) {
        const logo = g.logoUrl || g.logoPreset ? { logoUrl: g.logoUrl, logoPreset: g.logoPreset ?? "site" } : effectiveLogo(theme, g);
        header = { name: (host?.business_name as string | null) ?? inv.seller_name, logoUrl: logo.logoUrl, logoPreset: logo.logoPreset };
      } else {
        const logo = effectiveLogo(theme, { ...g, propertyLogos: "own" });
        header = { name: (prop as { name: string }).name, logoUrl: logo.logoUrl, logoPreset: logo.logoPreset };
      }
    } catch {
      header = null;
    }
    return { found: true as const, invoice: inv, header };
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

/* ------------------------- leaving guests (Today) ------------------------ */

export type InvoiceStatus = {
  bookingId: string;
  /** Direct stay with a price, and invoices switched on. */
  offered: boolean;
  email: string | null;
  token: string | null;
  emailedAt: string | null;
};

/** Invoice state for a few stays at once: whether one is offered, made and emailed. */
export const getInvoiceStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingIds: z.array(uuid).max(50) }).parse(d))
  .handler(async ({ data, context }): Promise<InvoiceStatus[]> => {
    if (!data.bookingIds.length) return [];
    // RLS: only stays the caller can see.
    const { data: visible } = await context.supabase.from("bookings").select("id").in("id", data.bookingIds);
    const ids = (visible ?? []).map((b) => b.id);
    const db = await admin();
    const { data: invs, error } = await (db as unknown as { from: (t: string) => any })
      .from("invoices")
      .select("booking_id, access_token, buyer_email, emailed_at")
      .in("booking_id", ids);
    const byBooking = new Map(((error ? [] : invs) ?? []).map((i: { booking_id: string }) => [i.booking_id, i]));
    const out: InvoiceStatus[] = [];
    for (const id of ids) {
      const d = await draftFor(id);
      const inv = byBooking.get(id) as { access_token: string; buyer_email: string | null; emailed_at?: string | null } | undefined;
      out.push({
        bookingId: id,
        offered: !!d?.offered || !!inv,
        email: inv?.buyer_email ?? d?.buyerEmail ?? null,
        token: inv?.access_token ?? null,
        emailedAt: inv?.emailed_at ?? null,
      });
    }
    return out;
  });

/** Makes the stay's invoice if there isn't one yet; returns its link token. */
export const ensureBookingInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const { data: b } = await context.supabase.from("bookings").select("property_id").eq("id", data.bookingId).maybeSingle();
    if (!b) throw new Error("We couldn't find that stay.");
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, b.property_id));
    const db = await admin();
    const { data: existing } = await db.from("invoices").select("access_token").eq("booking_id", data.bookingId).maybeSingle();
    if (existing) return { token: existing.access_token };
    const d = await draftFor(data.bookingId);
    if (!d?.offered) throw new Error("Invoices are for direct stays with a price. Add the price on the booking first.");
    return { token: await createInvoice(d, {}, "host") };
  });

/**
 * Emails the guest a link to their invoice (made first if needed). Only to
 * the address on the invoice or stay; in demo mode nothing is sent.
 */
export const emailBookingInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: uuid, origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const { data: b } = await context.supabase.from("bookings").select("property_id").eq("id", data.bookingId).maybeSingle();
    if (!b) throw new Error("We couldn't find that stay.");
    const hostId = await hostOfProperty(context.supabase, b.property_id);
    await requireWrite(context.supabase, hostId);
    const d = await draftFor(data.bookingId);
    const db = await admin();
    const { data: existing } = await db
      .from("invoices")
      .select("id, access_token, number, buyer_email, total_pence, currency, seller_name")
      .eq("booking_id", data.bookingId)
      .maybeSingle();
    if (!existing && !d?.offered) throw new Error("Invoices are for direct stays with a price. Add the price on the booking first.");
    const to = existing?.buyer_email ?? d?.buyerEmail ?? null;
    if (!to) return { sent: false as const, reason: "no_email" as const };

    const { hostModes } = await import("./checkin.server");
    if ((await hostModes(hostId)).guest_messages !== "live") return { sent: false as const, reason: "demo" as const };

    const token = existing?.access_token ?? (await createInvoice(d!, {}, "host"));
    const { data: inv } = await db.from("invoices").select("id, number, total_pence, currency, seller_name").eq("access_token", token).single();
    if (!inv) throw new Error("We couldn't find the invoice.");
    const link = `${new URL(data.origin).origin}/invoice/${token}`;
    const total = new Intl.NumberFormat("en-GB", { style: "currency", currency: inv.currency }).format(inv.total_pence / 100);
    const { sendGuestEmail } = await import("./alert-email.server");
    const sent = await sendGuestEmail({
      to,
      subject: `Your invoice ${inv.number} from ${inv.seller_name}`,
      body: `Thank you for staying with us.\n\nYour invoice ${inv.number} for ${total} is here:\n${link}\n\nOpen it to print or save it as a PDF.`,
      from: inv.seller_name,
      key: `invoice-${inv.id}-${Date.now()}`,
    });
    if (!sent) return { sent: false as const, reason: "failed" as const };
    await (db as unknown as { from: (t: string) => any })
      .from("invoices")
      .update({ emailed_at: new Date().toISOString(), emailed_to: to })
      .eq("id", inv.id);
    return { sent: true as const, reason: null };
  });
