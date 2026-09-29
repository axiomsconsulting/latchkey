/**
 * Public server functions for guest self check-in. No sign-in: every call is
 * validated, rate-limited per device, and only ever returns a first name.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { todayInZone, zonedParts } from "./dates";
import {
  MAX_LAST4_ATTEMPTS,
  MAX_PHOTO_ATTEMPTS,
  arrivalCandidates,
  checkoutChoices,
  emailMatches,
  findBooking,
  firstName,
  last4Matches,
  lockedUntil,
  methodSequence,
  normaliseMethods,
  shortName,
  usesListFlow,
} from "./checkin-logic";
import { compareNames } from "./name-match";
import { normaliseTheme } from "./theme";

const code = z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/i);
const deviceId = z.string().min(8).max(80);
const token = z.string().min(20).max(80);
const channel = z.enum(["airbnb", "booking_com", "homestay", "direct", "other"]);

async function srv() {
  return import("./checkin.server");
}

function hourIn(tz: string): number {
  return zonedParts(new Date(), tz).hour;
}

/* --------------------------- property + entry ---------------------------- */

export const getCheckinProperty = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ code }).parse(d))
  .handler(async ({ data }) => {
    const { loadPropertyByCode } = await srv();
    const p = await loadPropertyByCode(data.code);
    if (!p) return { found: false as const };
    const tz = p.timezone ?? "Europe/London";
    const today = todayInZone(tz);
    const methods = normaliseMethods(p.checkin_methods);
    return {
      found: true as const,
      name: p.name,
      code: p.short_code,
      today,
      checkoutChoices: checkoutChoices(today, hourIn(tz)),
      listFlow: usesListFlow(methods),
      hostPhone: p.host_contact_phone,
      theme: normaliseTheme(p.theme_config),
    };
  });

export const resolvePin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await srv();
    const db = await admin();
    // Slow every guess down so the PIN cannot be brute-forced quickly.
    await new Promise((r) => setTimeout(r, 600));
    const { data: p } = await db
      .from("properties")
      .select("short_code")
      .eq("check_in_pin", data.pin)
      .eq("active", true)
      .maybeSingle();
    return p ? { code: p.short_code } : { code: null };
  });

/* ------------------------------ matching -------------------------------- */

async function deviceLock(propertyId: string, hash: string) {
  const { admin } = await srv();
  const db = await admin();
  const { data } = await db
    .from("check_in_attempts")
    .select("succeeded, created_at")
    .eq("property_id", propertyId)
    .eq("device_hash", hash)
    .order("created_at", { ascending: false })
    .limit(10);
  return lockedUntil(data ?? [], new Date());
}

async function startSession(propertyId: string, bookingId: string) {
  const { admin, newToken } = await srv();
  const db = await admin();
  const t = newToken();
  await db.from("checkin_sessions").insert({
    token_hash: t.hash,
    property_id: propertyId,
    booking_id: bookingId,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  return t.token;
}

export const matchBooking = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        code,
        deviceId,
        letter: z.string().regex(/^[A-Za-z]$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        channel,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, deviceHash, loadPropertyByCode, raiseAlert } = await srv();
    const p = await loadPropertyByCode(data.code);
    if (!p) throw new Error("We could not find this property.");
    const hash = deviceHash(p.id, data.deviceId);

    const locked = await deviceLock(p.id, hash);
    if (locked) return { status: "locked" as const, until: locked.toISOString() };

    const db = await admin();
    const today = todayInZone(p.timezone ?? "Europe/London");
    const { data: rows } = await db
      .from("bookings")
      .select("id, channel, status, check_in_date, check_out_date, guest_full_name, mirror_of")
      .eq("property_id", p.id)
      .lte("check_in_date", today)
      .gt("check_out_date", today)
      .limit(200);
    const all = rows ?? [];

    const hit = findBooking(all, today, data);
    await db.from("check_in_attempts").insert({
      property_id: p.id,
      booking_id: hit?.id ?? null,
      surname_attempt: data.letter.toUpperCase(),
      succeeded: Boolean(hit),
      device_hash: hash,
    });

    if (!hit) {
      const nowLocked = await deviceLock(p.id, hash);
      if (nowLocked) {
        await raiseAlert({
          hostId: p.host_id,
          propertyId: p.id,
          kind: "lockout",
          message: `Check-in at ${p.name} was locked for 10 minutes after 3 unsuccessful tries on one device.`,
        });
        return { status: "locked" as const, until: nowLocked.toISOString() };
      }
      return { status: "no_match" as const };
    }

    return {
      status: "matched" as const,
      token: await startSession(p.id, hit.id),
      firstName: firstName(hit.guest_full_name),
    };
  });

/** Pick-your-booking list, only when the host has switched ID checks off. */
export const listArrivals = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code, deviceId, channel }).parse(d))
  .handler(async ({ data }) => {
    const { admin, deviceHash, loadPropertyByCode } = await srv();
    const p = await loadPropertyByCode(data.code);
    if (!p || !usesListFlow(normaliseMethods(p.checkin_methods))) return { items: [] };
    const locked = await deviceLock(p.id, deviceHash(p.id, data.deviceId));
    if (locked) return { items: [], until: locked.toISOString() };
    const db = await admin();
    const today = todayInZone(p.timezone ?? "Europe/London");
    const { data: rows } = await db
      .from("bookings")
      .select("id, channel, status, check_in_date, check_out_date, guest_full_name, mirror_of")
      .eq("property_id", p.id)
      .eq("channel", data.channel)
      .lte("check_in_date", today)
      .gt("check_out_date", today)
      .limit(50);
    return {
      items: arrivalCandidates(rows ?? [], today)
        .filter((b) => b.guest_full_name)
        .map((b) => ({ id: b.id, label: shortName(b.guest_full_name), checkOut: b.check_out_date })),
    };
  });

export const pickArrival = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code, deviceId, bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { admin, loadPropertyByCode } = await srv();
    const p = await loadPropertyByCode(data.code);
    if (!p || !usesListFlow(normaliseMethods(p.checkin_methods))) throw new Error("Not available.");
    const db = await admin();
    const today = todayInZone(p.timezone ?? "Europe/London");
    const { data: b } = await db
      .from("bookings")
      .select("id, channel, status, check_in_date, check_out_date, guest_full_name, mirror_of")
      .eq("id", data.bookingId)
      .eq("property_id", p.id)
      .maybeSingle();
    if (!b || arrivalCandidates([b], today).length !== 1) throw new Error("That stay is not available.");
    return { token: await startSession(p.id, b.id), firstName: firstName(b.guest_full_name) };
  });

/* ------------------------------ identity -------------------------------- */

async function sessionContext(t: string) {
  const { admin, loadSession } = await srv();
  const session = await loadSession(t);
  const db = await admin();
  const { data: b } = await db
    .from("bookings")
    .select("id, property_id, guest_full_name, reservation_code, phone_last4, guest_email, check_out_date, room_id")
    .eq("id", session.booking_id)
    .single();
  const { data: p } = await db
    .from("properties")
    .select("id, host_id, name, checkin_methods")
    .eq("id", session.property_id)
    .single();
  if (!b || !p) throw new Error("This check-in has timed out. Please start again.");
  return { db, session, booking: b, property: p };
}

function last4Kinds(b: { reservation_code: string | null; phone_last4: string | null; guest_email: string | null }) {
  const kinds: Array<"reference" | "phone" | "email"> = [];
  if (b.reservation_code && b.reservation_code.replace(/[^a-z0-9]/gi, "").length >= 4) kinds.push("reference");
  if (b.phone_last4) kinds.push("phone");
  if (b.guest_email) kinds.push("email");
  return kinds;
}

export const confirmBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { db, session, booking, property } = await sessionContext(data.token);
    await db.from("checkin_sessions").update({ confirmed: true }).eq("id", session.id);
    const methods = normaliseMethods(property.checkin_methods);
    const kinds = last4Kinds(booking);
    return {
      listFlow: usesListFlow(methods),
      sequence: usesListFlow(methods)
        ? (["self_declare"] as const)
        : methodSequence(methods, { last4: kinds.length > 0 }),
      last4Kinds: kinds,
    };
  });

async function recordResult(
  ctx: Awaited<ReturnType<typeof sessionContext>>,
  method: string,
  result: "matched" | "partial" | "not_matched" | "last4" | "self_declared",
) {
  const { raiseAlert } = await srv();
  const { db, session, booking, property } = ctx;
  const deleteAfter = new Date(Date.parse(`${booking.check_out_date}T00:00:00Z`) + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await db.from("verification_results").insert({
    booking_id: booking.id,
    method,
    passed: result === "matched" || result === "last4",
    detail: result,
    delete_after: deleteAfter,
  });
  await db.from("bookings").update({ id_check_status: result }).eq("id", booking.id);
  await db.from("checkin_sessions").update({ verified_method: method }).eq("id", session.id);

  const who = firstName(booking.guest_full_name) || "A guest";
  if (result === "not_matched" || result === "partial" || result === "self_declared") {
    const message =
      result === "self_declared"
        ? `${who} checked in at ${property.name} without an ID check. Please check their ID when you see them.`
        : result === "partial"
          ? `${who}'s ID only partly matched the booking name at ${property.name}. Worth a quick look.`
          : `${who}'s ID did not match the booking name at ${property.name}. Please check in person.`;
    await raiseAlert({
      hostId: property.host_id,
      propertyId: property.id,
      bookingId: booking.id,
      kind: result === "self_declared" ? "self_declared" : result === "partial" ? "id_partial" : "id_mismatch",
      message,
    });
  }
}

export const verifyPhotoId = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        image: z
          .string()
          .max(6_000_000)
          .regex(/^data:image\/(jpeg|png|webp);base64,/),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token);
    const methods = normaliseMethods(ctx.property.checkin_methods);
    if (!ctx.session.confirmed || !methods.enabled.photo_id) throw new Error("Not available.");
    if (ctx.session.photo_attempts >= MAX_PHOTO_ATTEMPTS) return { status: "fallback" as const };

    await ctx.db
      .from("checkin_sessions")
      .update({ photo_attempts: ctx.session.photo_attempts + 1 })
      .eq("id", ctx.session.id);
    const left = MAX_PHOTO_ATTEMPTS - ctx.session.photo_attempts - 1;

    const { readNameFromId, hostModes } = await srv();
    let read: { name: string | null; isId: boolean };
    try {
      const modes = await hostModes(ctx.property.host_id);
      // Demo mode: skip the AI call and pretend the ID shows the booking name.
      read = modes.id_check === "demo"
        ? { name: ctx.booking.guest_full_name, isId: true }
        : await readNameFromId(data.image);
    } catch {
      return left > 0 ? { status: "retry" as const, left } : { status: "fallback" as const };
    }
    if (!read.isId || !read.name) {
      return left > 0 ? { status: "retry" as const, left } : { status: "fallback" as const };
    }
    const result = compareNames(ctx.booking.guest_full_name, read.name);
    await recordResult(ctx, "photo_id", result);
    return { status: "done" as const, result };
  });

export const verifyLast4 = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        kind: z.enum(["reference", "phone", "email"]),
        value: z.string().trim().min(4).max(254),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token);
    const methods = normaliseMethods(ctx.property.checkin_methods);
    if (!ctx.session.confirmed || !methods.enabled.last4) throw new Error("Not available.");
    if (ctx.session.last4_attempts >= MAX_LAST4_ATTEMPTS) return { status: "fallback" as const };

    const b = ctx.booking;
    const ok =
      data.kind === "reference"
        ? last4Matches(b.reservation_code, data.value)
        : data.kind === "phone"
          ? last4Matches(b.phone_last4, data.value)
          : emailMatches(b.guest_email, data.value);

    if (!ok) {
      const used = ctx.session.last4_attempts + 1;
      await ctx.db.from("checkin_sessions").update({ last4_attempts: used }).eq("id", ctx.session.id);
      return used >= MAX_LAST4_ATTEMPTS
        ? { status: "fallback" as const }
        : { status: "retry" as const, left: MAX_LAST4_ATTEMPTS - used };
    }
    await recordResult(ctx, "last4", "last4");
    return { status: "done" as const };
  });

export const selfDeclare = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token);
    if (!ctx.session.confirmed) throw new Error("Not available.");
    const methods = normaliseMethods(ctx.property.checkin_methods);
    // In list flow the host has chosen not to check ID, so it is not an exception.
    if (usesListFlow(methods)) {
      await ctx.db.from("checkin_sessions").update({ verified_method: "none" }).eq("id", ctx.session.id);
      return { status: "done" as const };
    }
    await recordResult(ctx, "self_declare", "self_declared");
    return { status: "done" as const };
  });

/* ------------------------------ finishing ------------------------------- */

export const completeCheckIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { newToken } = await srv();
    const { db, session, booking } = await sessionContext(data.token);
    if (!session.verified_method) throw new Error("Please finish the check-in steps first.");

    const { data: room } = booking.room_id
      ? await db.from("rooms").select("display_name, public_title, room_number").eq("id", booking.room_id).maybeSingle()
      : { data: null };

    if (!session.completed_at) {
      const now = new Date().toISOString();
      await db.from("bookings").update({ status: "checked_in", checked_in_at: now }).eq("id", booking.id);
      await db.from("presence_log").insert({ booking_id: booking.id, event: "arrived", source: "self_check_in" });
      await db.from("checkin_sessions").update({ completed_at: now }).eq("id", session.id);
    }

    const stay = newToken();
    const { guideWindow } = await import("./guide");
    const { data: bt } = await db
      .from("bookings")
      .select("check_in_date, check_out_date, check_out_time, properties(timezone, default_check_out_time)")
      .eq("id", booking.id)
      .single();
    const bp = (bt as { properties?: { timezone: string | null; default_check_out_time: string } } | null)?.properties;
    const win = guideWindow(
      bt?.check_in_date ?? booking.check_out_date,
      booking.check_out_date,
      (bt?.check_out_time ?? bp?.default_check_out_time ?? "11:00").slice(0, 5),
      bp?.timezone ?? "Europe/London",
    );
    await db.from("stay_tokens").insert({
      token_hash: stay.hash,
      booking_id: booking.id,
      expires_at: win.expiresAt.toISOString(),
    });

    return {
      firstName: firstName(booking.guest_full_name),
      roomName: room?.display_name ?? null,
      roomTitle: room?.public_title ?? null,
      stayToken: stay.token,
    };
  });

export const getStay = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { admin, sha256 } = await srv();
    const db = await admin();
    const { data: t } = await db
      .from("stay_tokens")
      .select("booking_id, expires_at, valid_from")
      .eq("token_hash", sha256(data.token))
      .maybeSingle();
    if (!t || Date.parse(t.expires_at) < Date.now()) return { found: false as const };
    if (t.valid_from && Date.parse(t.valid_from) > Date.now()) {
      return { found: false as const, opensAt: t.valid_from };
    }
    const { data: b } = await db
      .from("bookings")
      .select("guest_full_name, check_out_date, check_out_time, room_id, property_id, status")
      .eq("id", t.booking_id)
      .single();
    if (!b || b.status === "cancelled") return { found: false as const };
    const [{ data: p }, { data: room }, { data: guides }, { data: windows }] = await Promise.all([
      db
        .from("properties")
        .select("name, timezone, default_check_out_time, quiet_hours_start, quiet_hours_end, wifi_name, wifi_password, parking_notes, host_contact_name, host_contact_phone, theme_config")
        .eq("id", b.property_id)
        .single(),
      b.room_id
        ? db.from("rooms").select("display_name, public_title, description, has_ensuite, guide_mode").eq("id", b.room_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from("guides")
        .select("room_id, section_key, summary, published, guide_steps(heading, body, image_url, sort_order)")
        .eq("property_id", b.property_id)
        .eq("published", true)
        .not("section_key", "is", null),
      db
        .from("unavailability_windows")
        .select("room_id, reason, starts_at, ends_at, day_of_week, start_time, end_time")
        .eq("property_id", b.property_id),
    ]);

    const { buildGuide, forgetCard, weeklyLines, windowsOn } = await import("./guide");
    const tz = p?.timezone ?? "Europe/London";
    const today = todayInZone(tz);
    const checkOutTime = (b.check_out_time ?? p?.default_check_out_time ?? "11:00").slice(0, 5);
    const facts = {
      wifiName: p?.wifi_name ?? null,
      wifiPassword: p?.wifi_password ?? null,
      quietStart: (p?.quiet_hours_start ?? "22:00").slice(0, 5),
      quietEnd: (p?.quiet_hours_end ?? "07:00").slice(0, 5),
      checkOutTime,
      checkOutDateLabel: formatUkDate(b.check_out_date),
      parkingNotes: p?.parking_notes ?? null,
      hostName: p?.host_contact_name ?? null,
      hostPhone: p?.host_contact_phone ?? null,
      roomName: room?.display_name ?? null,
      unavailableLines: weeklyLines(windows ?? [], b.room_id),
    };
    const mode = (room?.guide_mode === "basic" ? "basic" : "detailed") as "basic" | "detailed";

    // Photos live in private storage; sign short-lived links for this view only.
    const paths = mode === "detailed"
      ? (guides ?? []).flatMap((g) => (g.guide_steps ?? []).map((s) => s.image_url).filter((x): x is string => !!x))
      : [];
    const signed: Record<string, string> = {};
    if (paths.length) {
      const { data: urls } = await db.storage.from("guides").createSignedUrls(paths, 60 * 60 * 2);
      for (const u of urls ?? []) if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
    }
    const stored = (guides ?? []).map((g) => ({
      roomId: g.room_id,
      sectionKey: g.section_key as import("./guide").SectionKey,
      summary: g.summary,
      steps: [...(g.guide_steps ?? [])]
        .sort((a, c) => a.sort_order - c.sort_order)
        .map((s) => ({ heading: s.heading, body: s.body, imageUrl: s.image_url ? (signed[s.image_url] ?? null) : null })),
    }));

    return {
      found: true as const,
      firstName: firstName(b.guest_full_name),
      checkOutDate: b.check_out_date,
      checkOutTime,
      property: p,
      room,
      theme: normaliseTheme(p?.theme_config),
      mode,
      guide: buildGuide(stored, b.room_id, mode, facts),
      forget: forgetCard(facts, windowsOn(windows ?? [], b.room_id, today, tz)),
    };
  });

/* -------------------------------- kiosk --------------------------------- */

export const kioskUnlock = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code, pin: z.string().regex(/^\d{4,8}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { loadPropertyByCode } = await srv();
    await new Promise((r) => setTimeout(r, 600));
    const p = await loadPropertyByCode(data.code);
    return { ok: Boolean(p && p.check_in_pin && p.check_in_pin === data.pin) };
  });
