/**
 * Direct booking and payment on the "Stay with us" page (src/lib/direct-booking.ts,
 * migration 0053). A guest reserves a free room at a refundable or
 * non-refundable rate; the booking is made at once (so the room is held and
 * the room's Latchkey calendar tells the other sites), and payment is by card
 * (a Stripe Checkout in the host's own account, released if unpaid in 30
 * minutes), bank transfer (the host's details and a reference) or at the
 * property. The price is always worked out here, never trusted from the page.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hostOfProperty, requireWrite } from "@/lib/roles";

type Loose = { from: (t: string) => any };
const uuid = z.string().uuid();
const code = z.string().min(2).max(60).regex(/^[a-z0-9-]+$/i);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accessToken = z.string().min(24).max(80);

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

const todayIn = (tz: string | null) => new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "Europe/London" }).format(new Date());

/** What a property's direct booking can do: the host's settings, and what's set up (Stripe ready, bank details complete). */
export async function bookingSetup(db: Loose, property: { id: string; host_id: string; country_code?: string | null }) {
  const { withLegacy } = await import("./checkin.server");
  const { normaliseDirectBooking, payMethods } = await import("./direct-booking");
  const { normaliseBankAccount, bankReady } = await import("./bank-details");
  const [{ data: p }, { data: h }] = await Promise.all([
    withLegacy<any>(
      () => db.from("properties").select("direct_booking").eq("id", property.id).maybeSingle(),
      () => Promise.resolve({ data: null, error: null }),
    ),
    withLegacy<any>(
      () => db.from("hosts").select("stripe_account_id, stripe_account_ready, uses_platform_stripe, bank_account").eq("id", property.host_id).maybeSingle(),
      () => db.from("hosts").select("stripe_account_id, stripe_account_ready, uses_platform_stripe").eq("id", property.host_id).maybeSingle(),
    ),
  ]);
  const settings = normaliseDirectBooking(p?.direct_booking);
  const bank = normaliseBankAccount(h?.bank_account, property.country_code ?? "GB");
  const stripe = h?.uses_platform_stripe ? { ready: true, account: null as string | null } : { ready: !!h?.stripe_account_id && !!h?.stripe_account_ready, account: (h?.stripe_account_id as string | null) ?? null };
  const ready = { card: stripe.ready, bank: bankReady(bank) };
  return { settings, bank, stripe, ready, methods: payMethods(settings, ready) };
}

/* ------------------------------ exchange rates ------------------------------ */

const fxCache = new Map<string, { at: number; rate: number; date: string }>();

/** Today's reference rate (European Central Bank, via Frankfurter), kept for 12 hours; null when it can't be had. */
export const getFxRate = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ from: z.string().regex(/^[A-Z]{3}$/), to: z.string().regex(/^[A-Z]{3}$/) }).parse(d))
  .handler(async ({ data }) => {
    if (data.from === data.to) return { rate: 1, date: null };
    const key = `${data.from}-${data.to}`;
    const hit = fxCache.get(key);
    if (hit && Date.now() - hit.at < 12 * 3_600_000) return { rate: hit.rate, date: hit.date };
    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${data.from}&to=${data.to}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
      const rate = body.rates?.[data.to];
      if (typeof rate !== "number" || !(rate > 0)) return null;
      fxCache.set(key, { at: Date.now(), rate, date: body.date ?? "" });
      return { rate, date: body.date ?? null };
    } catch {
      return null;
    }
  });

/* -------------------------------- reserving -------------------------------- */

export const reserveDirect = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code,
        roomId: uuid,
        checkIn: iso,
        checkOut: iso,
        guests: z.number().int().min(1).max(20),
        plan: z.enum(["flex", "nonref"]),
        method: z.enum(["card", "bank", "property"]),
        name: z.string().max(120),
        email: z.string().max(254),
        phone: z.string().max(30).nullable(),
        guestCountry: z.string().regex(/^[A-Z]{2}$/).nullable(),
        message: z.string().max(2000).nullable(),
        origin: z.string().url(),
        /** Left empty by people; filled by bots. */
        website: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.website) throw new Error("Please try again.");
    const db = await admin();
    const { enquiryProblem, normaliseEmail } = await import("./direct");
    const { normaliseOffers, roomTaken } = await import("./direct-rates");
    const { quotePlan, freeCancelUntil, newReference } = await import("./direct-booking");
    const { addDays } = await import("./dates");

    const { data: p } = await db
      .from("properties")
      .select("id, host_id, name, short_code, timezone, country_code, currency, active, direct_offers, hosts(business_name, currency)")
      .eq("short_code", data.code.toLowerCase())
      .maybeSingle();
    if (!p || p.active === false) throw new Error("This page isn't taking bookings.");
    const today = todayIn(p.timezone);
    const problem = enquiryProblem({ name: data.name, email: data.email, phone: data.phone, checkIn: data.checkIn, checkOut: data.checkOut, guests: data.guests }, today);
    if (problem) throw new Error(problem);

    const setup = await bookingSetup(db, p);
    if (!setup.settings.instant) throw new Error("This property takes booking requests only. Please send a request instead.");
    if (!setup.methods.includes(data.method)) throw new Error("That way of paying isn't available. Please choose another.");

    const { data: room } = await db.from("rooms").select("id, display_name, public_title, max_guests, base_rate_pence, active, property_id").eq("id", data.roomId).maybeSingle();
    if (!room || room.property_id !== p.id || room.active === false) throw new Error("That room isn't available.");
    if (typeof room.base_rate_pence !== "number") throw new Error("That room can only be requested. Please send a request instead.");
    if (data.guests > (room.max_guests ?? 2)) throw new Error(`That room sleeps up to ${room.max_guests}.`);

    // Free those nights? Checked against every stay in the room, from every site.
    const { data: stays } = await db
      .from("bookings")
      .select("check_in_date, check_out_date")
      .eq("room_id", room.id)
      .is("mirror_of", null)
      .neq("status", "cancelled")
      .lt("check_in_date", data.checkOut)
      .gt("check_out_date", data.checkIn);
    if (roomTaken(((stays ?? []) as Array<{ check_in_date: string; check_out_date: string }>).map((s) => ({ from: s.check_in_date, to: s.check_out_date })), data.checkIn, data.checkOut)) {
      throw new Error("Sorry, that room has just been booked for some of those nights. Please choose other dates or another room.");
    }

    const quote = quotePlan(room.base_rate_pence, data.plan, setup.settings, normaliseOffers(p.direct_offers), room.id, data.checkIn, data.checkOut);
    if (!quote) throw new Error("That rate isn't offered. Please choose another.");
    const currency = (p.currency as string | null) || (p.hosts?.currency as string | null) || "GBP";
    const roomName = (room.public_title as string | null) || (room.display_name as string);
    const reference = newReference();
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(24).toString("base64url");
    const email = normaliseEmail(data.email);
    const cancelUntil = data.plan === "flex" ? freeCancelUntil(data.checkIn, setup.settings, today) : null;
    const payNote = data.method === "card" ? "Paying by card (awaiting payment)" : data.method === "bank" ? `Paying by bank transfer, reference ${reference}` : "Paying at the property";

    // The booking holds the room straight away (and the room's Latchkey calendar shows it to other sites).
    const { data: booking, error: bookingError } = await db
      .from("bookings")
      .insert({
        property_id: p.id,
        room_id: room.id,
        channel: "direct",
        source: "manual",
        status: "upcoming",
        guest_full_name: data.name.trim(),
        guest_email: email,
        guest_count: Math.min(12, data.guests),
        check_in_date: data.checkIn,
        check_out_date: data.checkOut,
        reservation_code: reference,
        stay_amount_pence: quote.total,
        stay_amount_includes_tax: true,
        notes: [`Booked on the Stay with us page (${data.plan === "flex" ? "refundable" : "non-refundable"} rate).`, payNote, data.message?.trim() ? `Guest's note: ${data.message.trim().slice(0, 400)}` : null].filter(Boolean).join(" "),
      })
      .select("id")
      .single();
    if (bookingError || !booking) throw new Error("That booking couldn't be made. Please try again.");

    const payBy = data.method === "card" ? new Date(Date.now() + 30 * 60_000).toISOString() : data.method === "bank" ? new Date(Date.now() + setup.settings.bankPayDays * 86_400_000).toISOString() : null;
    const row = {
      host_id: p.host_id,
      property_id: p.id,
      room_id: room.id,
      booking_id: booking.id,
      reference,
      access_token: token,
      name: data.name.trim(),
      email,
      phone: data.phone?.trim() || null,
      guest_country: data.guestCountry,
      check_in: data.checkIn,
      check_out: data.checkOut,
      guests: data.guests,
      plan: data.plan,
      method: data.method,
      total_pence: quote.total,
      currency,
      free_cancel_until: cancelUntil,
      status: data.method === "property" ? "confirmed" : "pending",
      pay_by: payBy,
    };
    const { data: res, error } = await db.from("direct_reservations").insert(row).select("id").single();
    if (error || !res) {
      await db.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
      throw new Error(/direct_reservations/.test(error?.message ?? "") ? "Booking here isn't ready yet. Please send a request instead." : "That booking couldn't be made. Please try again.");
    }

    const { raiseAlert } = await import("./checkin.server");
    await raiseAlert({
      hostId: p.host_id,
      propertyId: p.id,
      kind: "direct_enquiry",
      message: `${data.name.trim()} booked ${roomName}, ${data.checkIn} to ${data.checkOut} (${data.plan === "flex" ? "refundable" : "non-refundable"}, ${data.method === "card" ? "card" : data.method === "bank" ? "bank transfer" : "pay at property"}) at ${p.name}. Ref ${reference}.`,
    }).catch(() => undefined);

    if (data.method !== "card") return { token, url: null as string | null };

    // Card: a Stripe Checkout in the host's own account, open for 30 minutes.
    const { stripeCall } = await import("./stripe.server");
    const { stripeAmount } = await import("./extras");
    const nights = quote.nights;
    try {
      const session = await stripeCall<{ id: string; url: string }>(
        "/checkout/sessions",
        {
          mode: "payment",
          customer_email: email,
          success_url: `${data.origin}/reserve/${token}?paid=1`,
          cancel_url: `${data.origin}/reserve/${token}?paid=0`,
          client_reference_id: res.id,
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60 + 60,
          metadata: { kind: "direct_reservation", reservation_id: res.id, booking_id: booking.id },
          payment_intent_data: { metadata: { kind: "direct_reservation", reservation_id: res.id } },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: currency.toLowerCase(),
                unit_amount: stripeAmount(quote.total, currency.toLowerCase()),
                product_data: {
                  name: `${p.name} — ${roomName}`,
                  description: `${data.checkIn} to ${data.checkOut} · ${nights} ${nights === 1 ? "night" : "nights"} · ${data.plan === "flex" ? "Refundable rate" : "Non-refundable rate"} · Ref ${reference}`.slice(0, 300),
                },
              },
            },
          ],
        },
        "POST",
        setup.stripe.account,
      );
      await db.from("direct_reservations").update({ stripe_session_id: session.id, stripe_account_id: setup.stripe.account }).eq("id", res.id);
      return { token, url: session.url };
    } catch {
      // No checkout: release the room and say so.
      await db.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
      await db.from("direct_reservations").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", res.id);
      throw new Error("Card payment isn't working right now. Please choose another way to pay, or try again shortly.");
    }
  });

/** Marks a card reservation paid (from the webhook or on return from Stripe). */
export async function markReservationPaid(db: Loose, reservationId: string, paymentIntent: string | null) {
  const now = new Date().toISOString();
  const { data: r } = await db.from("direct_reservations").select("id, status, booking_id").eq("id", reservationId).maybeSingle();
  if (!r || r.status === "paid") return;
  await db.from("direct_reservations").update({ status: "paid", paid_at: now, stripe_payment_intent: paymentIntent, updated_at: now }).eq("id", reservationId);
  if (r.booking_id) {
    const { data: b } = await db.from("bookings").select("notes, status").eq("id", r.booking_id).maybeSingle();
    await db
      .from("bookings")
      .update({ status: b?.status === "cancelled" ? "upcoming" : (b?.status ?? "upcoming"), notes: String(b?.notes ?? "").replace("Paying by card (awaiting payment)", "Paid by card") })
      .eq("id", r.booking_id);
  }
}

/** An unpaid card reservation whose checkout ran out: the room is released. */
export async function expireReservation(db: Loose, reservationId: string) {
  const { data: r } = await db.from("direct_reservations").select("id, status, booking_id, method").eq("id", reservationId).maybeSingle();
  if (!r || r.status !== "pending" || r.method !== "card") return;
  await db.from("direct_reservations").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", reservationId);
  if (r.booking_id) await db.from("bookings").update({ status: "cancelled" }).eq("id", r.booking_id);
}

/** The guest's confirmation page: their booking, how to pay (bank details for a transfer), and its state. */
export const getReservation = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: accessToken }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: r } = await db
      .from("direct_reservations")
      .select("*, rooms(display_name, public_title), properties(name, short_code, country_code, host_id, theme_config, hosts(business_name, contact_email, contact_phone))")
      .eq("access_token", data.token)
      .maybeSingle();
    if (!r) return { found: false as const };
    // A card checkout left too long is released when the guest looks.
    if (r.status === "pending" && r.method === "card" && r.pay_by && Date.parse(r.pay_by) < Date.now()) {
      await expireReservation(db, r.id);
      r.status = "expired";
    }
    const { normaliseTheme } = await import("./theme");
    const setup = await bookingSetup(db, { id: r.property_id, host_id: r.properties?.host_id, country_code: r.properties?.country_code });
    const { bankLinesFor } = await import("./bank-details");
    return {
      found: true as const,
      reference: r.reference as string,
      status: r.status as "pending" | "confirmed" | "paid" | "cancelled" | "expired",
      method: r.method as "card" | "bank" | "property",
      plan: r.plan as "flex" | "nonref",
      name: r.name as string,
      checkIn: r.check_in as string,
      checkOut: r.check_out as string,
      guests: r.guests as number,
      totalPence: r.total_pence as number,
      currency: r.currency as string,
      freeCancelUntil: (r.free_cancel_until as string | null) ?? null,
      payBy: (r.pay_by as string | null) ?? null,
      roomName: (r.rooms?.public_title as string | null) || (r.rooms?.display_name as string | null) || "",
      propertyName: (r.properties?.name as string | null) ?? "",
      shortCode: (r.properties?.short_code as string | null) ?? "",
      business: (r.properties?.hosts?.business_name as string | null) || (r.properties?.name as string | null) || "",
      contactEmail: (r.properties?.hosts?.contact_email as string | null) ?? null,
      contactPhone: (r.properties?.hosts?.contact_phone as string | null) ?? null,
      theme: normaliseTheme(r.properties?.theme_config),
      bankLines: r.method === "bank" ? bankLinesFor(setup.bank, (r.guest_country as string | null) ?? null) : [],
    };
  });

/** Back from Stripe: checks the checkout at once, so the page confirms without waiting for the webhook. */
export const confirmReservationPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: accessToken }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: r } = await db.from("direct_reservations").select("id, status, stripe_session_id, stripe_account_id").eq("access_token", data.token).maybeSingle();
    if (!r || r.status !== "pending" || !r.stripe_session_id) return { paid: r?.status === "paid" };
    const { stripeCall } = await import("./stripe.server");
    const s = await stripeCall<{ payment_status: string; payment_intent: string | null; client_reference_id: string | null }>(
      `/checkout/sessions/${r.stripe_session_id}`,
      undefined,
      "GET",
      r.stripe_account_id ?? null,
    ).catch(() => null);
    if (!s || s.payment_status !== "paid" || s.client_reference_id !== r.id) return { paid: false };
    await markReservationPaid(db, r.id, s.payment_intent);
    return { paid: true };
  });

/* ---------------------------------- host ---------------------------------- */

export const getDirectBookingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: p } = await sb.from("properties").select("id, host_id, country_code, currency, hosts(currency)").eq("id", data.propertyId).maybeSingle();
    if (!p) throw new Error("Property not found.");
    const setup = await bookingSetup(sb, p);
    const { data: rooms } = await sb.from("rooms").select("id, display_name, export_feed_enabled").eq("property_id", p.id).neq("active", false).order("sort_order");
    const { data: check, error } = await sb.from("direct_reservations").select("id").limit(1);
    return {
      available: !error && check !== undefined,
      settings: setup.settings,
      ready: setup.ready,
      currency: (p.currency as string | null) || (p.hosts?.currency as string | null) || "GBP",
      // Rooms whose Latchkey calendar isn't shared yet: other sites can't see direct bookings for them.
      roomsNotShared: ((rooms ?? []) as Array<{ id: string; display_name: string; export_feed_enabled: boolean | null }>).filter((r) => !r.export_feed_enabled).map((r) => r.display_name),
    };
  });

export const saveDirectBookingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, settings: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { normaliseDirectBooking } = await import("./direct-booking");
    const settings = normaliseDirectBooking(data.settings);
    const { error } = await (context.supabase as unknown as Loose).from("properties").update({ direct_booking: settings }).eq("id", data.propertyId);
    if (error) throw new Error(/direct_booking/.test(error.message) ? "Direct booking needs the latest update (migration 0053)." : error.message);
    return { ok: true, settings };
  });

/** The host marks a bank transfer received, or cancels a reservation (the booking is cancelled too; any refund is done in Stripe). */
export const setReservationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, status: z.enum(["paid", "cancelled", "confirmed"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: r } = await sb.from("direct_reservations").select("id, booking_id").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Reservation not found.");
    const now = new Date().toISOString();
    const { error } = await sb
      .from("direct_reservations")
      .update({ status: data.status, ...(data.status === "paid" ? { paid_at: now } : {}), updated_at: now })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.status === "cancelled" && r.booking_id) await sb.from("bookings").update({ status: "cancelled" }).eq("id", r.booking_id);
    return { ok: true };
  });
