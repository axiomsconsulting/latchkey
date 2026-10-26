/**
 * Public server functions for guest self check-in. No sign-in: every call is
 * validated, rate-limited per device, and only ever returns a first name.
 */

import { createServerFn } from "@tanstack/react-start";
import { withGroup } from "./group-brand.server";
import { z } from "zod";

import { isPlatformKey, platformKey } from "./booking-sites";
import { formatUkDate, todayInZone, zonedParts } from "./dates";
import {
  MAX_LAST4_ATTEMPTS,
  MAX_PHOTO_ATTEMPTS,
  arrivalCandidates,
  checkoutChoices,
  cleanGuestName,
  emailMatches,
  firstName,
  last4Matches,
  type MatchableBooking,
  lockedUntil,
  type CheckinMethod,
  methodSequence,
  normaliseMethods,
  resolveArrival,
  shortName,
  stayingCandidates,
  surnameInitial,
  usesListFlow,
} from "./checkin-logic";
import { DEMO_CODES, isTour } from "./demo-account";
import {
  ADULT_AGE,
  ageOn,
  bookedPartySize,
  checkParty,
  deleteAfter,
  judgeId,
  keepsIdPhoto,
  normaliseRecords,
  takesFacePhoto,
  type IdRead,
} from "./guest-records";
import {
  REGISTER_AGE,
  cleanRegisterEntry,
  nationalityFromId,
  registerApplies,
  registerKeepUntil,
} from "./hotel-register";
import { compareNames } from "./name-match";
import { normaliseTheme } from "./theme";

const code = z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/i);
const deviceId = z.string().min(8).max(80);
const token = z.string().min(20).max(80);
/** A built-in platform id or a booking site the host added. */
const channel = z.string().max(40).refine(isPlatformKey, "Unknown booking site.");
const jpeg = z.string().max(6_000_000).regex(/^data:image\/(jpeg|png|webp);base64,/);
/** The small copy kept for the host, already shrunk on the guest's device. */
const smallJpeg = z.string().max(560_000).regex(/^data:image\/jpeg;base64,/);

async function srv() {
  return import("./checkin.server");
}

function hourIn(tz: string): number {
  return zonedParts(new Date(), tz).hour;
}

/* --------------------------- property + entry ---------------------------- */

/**
 * Guest tour only: the answers for one fake guest, so visitors always reach a
 * successful check-in. If an earlier visitor already checked today's arrival
 * in, they are put back to arriving so the next visitor gets the same flow.
 */
async function demoHint(propertyId: string, today: string) {
  const { admin } = await srv();
  const db = await admin();
  const { data } = await db
    .from("bookings")
    .select("id, channel, status, check_in_date, check_out_date, guest_full_name, mirror_of, phone_last4, reservation_code")
    .eq("property_id", propertyId)
    .lte("check_in_date", today)
    .gt("check_out_date", today)
    .order("check_in_date", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as Array<MatchableBooking & { phone_last4: string | null; reservation_code: string | null }>;
  const named = (list: MatchableBooking[]) => list.find((x) => surnameInitial(x.guest_full_name));
  let hit = named(arrivalCandidates(rows, today));
  if (!hit) {
    const done = rows.find((r) => r.status === "checked_in" && r.check_in_date === today && surnameInitial(r.guest_full_name));
    if (done) await db.from("bookings").update({ status: "upcoming", checked_in_at: null }).eq("id", done.id);
    hit = done ?? named(stayingCandidates(rows, today));
  }
  const b = rows.find((r) => r.id === hit?.id);
  return b
    ? {
        letter: surnameInitial(b.guest_full_name) ?? "",
        name: b.guest_full_name ?? "",
        checkOut: b.check_out_date,
        channel: b.channel,
        refLast4: b.reservation_code ? b.reservation_code.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() : null,
        phoneLast4: b.phone_last4,
      }
    : null;
}

export const getCheckinProperty = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ code }).parse(d))
  .handler(async ({ data }) => {
    const srvMod = await srv();
    // The public guest tour rebuilds itself once a day, even when visitors
    // arrive straight from a link instead of through the demo picker.
    const tour = DEMO_CODES.includes(data.code.toLowerCase());
    if (tour) {
      const { jobAllowed } = await import("./usage.server");
      if (!(await jobAllowed("demo_tour"))) return { found: false as const };
      try {
        const { ensureTour } = await import("./demo.functions");
        await ensureTour(await srvMod.admin());
      } catch {
        // Another visitor may be rebuilding it at the same moment.
      }
    }
    type Property = Awaited<ReturnType<typeof srvMod.loadPropertyByCode>>;
    let p: Property = await srvMod.loadPropertyByCode(data.code);
    // A rebuild replaces the tour in well under a few seconds; wait it out.
    for (let i = 0; tour && !p && i < 6; i++) {
      await new Promise((r) => setTimeout(r, 500));
      p = await srvMod.loadPropertyByCode(data.code);
    }
    if (!p) return { found: false as const };
    // A host whose trial or subscription has ended can't take check-ins.
    const { data: access, error: accessErr } = await (await srvMod.admin()).rpc("host_has_access" as never, { _host_id: p.host_id } as never);
    if (!accessErr && access === false) return { found: false as const, paused: true as const };
    const tz = p.timezone ?? "Europe/London";
    const today = todayInZone(tz);
    const methods = normaliseMethods(p.checkin_methods);
    const { channelLabels, guestSites } = await import("./checkin.server");
    return {
      found: true as const,
      name: p.name,
      code: p.short_code,
      timezone: tz,
      quietStart: (p.quiet_hours_start ?? "22:00").slice(0, 5),
      quietEnd: (p.quiet_hours_end ?? "07:00").slice(0, 5),
      today,
      checkoutChoices: checkoutChoices(today, hourIn(tz)),
      listFlow: usesListFlow(methods),
      hostPhone: p.host_contact_phone,
      checkInFrom: (p.default_check_in_time ?? "15:00").slice(0, 5),
      checkOutBy: (p.default_check_out_time ?? "11:00").slice(0, 5),
      channelLabels: await channelLabels(p.host_id),
      sites: await guestSites(p.host_id),
      theme: await withGroup(normaliseTheme(p.theme_config), p.host_id, p.name ?? ""),
      demoHint: isTour(p) ? await demoHint(p.id, today) : null,
      /** The public guest tour: the same kiosk, with a few demo hooks (kiosk.$code.tsx). */
      tour: isTour(p),
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

async function deviceLock(propertyId: string, hash: string, tour = false) {
  // The public guest tour: visitors guess freely, never locked or alerted.
  if (tour) return null;
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

/** Stays overlapping today, with their added booking site when the database has it. */
async function arrivalsAround(propertyId: string, today: string, limit: number) {
  const { admin, withLegacy } = await srv();
  const db = await admin();
  const cols = "id, channel, status, check_in_date, check_out_date, guest_full_name, mirror_of";
  const q = (c: string) =>
    db.from("bookings").select(c).eq("property_id", propertyId).lte("check_in_date", today).gt("check_out_date", today).limit(limit);
  const res = await withLegacy(
    () =>
      db
        .from("bookings")
        .select(`${cols}, site_key`)
        .eq("property_id", propertyId)
        .lte("check_in_date", today)
        .gt("check_out_date", today)
        .limit(limit),
    () => q(cols),
  );
  return { data: (res.data ?? []) as MatchableBooking[] };
}

export const matchBooking = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        code,
        deviceId,
        letter: z.string().regex(/^[A-Za-z]$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        // Only sent when the first answers fit stays on more than one platform.
        channel: channel.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, deviceHash, loadPropertyByCode, raiseAlert } = await srv();
    const p = await loadPropertyByCode(data.code);
    if (!p) throw new Error("We could not find this property.");
    const hash = deviceHash(p.id, data.deviceId);

    const locked = await deviceLock(p.id, hash, isTour(p));
    if (locked) return { status: "locked" as const, until: locked.toISOString() };

    const db = await admin();
    const today = todayInZone(p.timezone ?? "Europe/London");
    const { data: rows } = await arrivalsAround(p.id, today, 200);
    const all = rows ?? [];

    // The platform question only comes up when it tells stays apart; a guest
    // already checked in is recognised as returning, not turned away.
    const found = resolveArrival(all, today, data);
    if (found.kind === "choose") return { status: "choose_platform" as const, channels: found.channels };
    const hit = found.kind === "match" ? found.booking : null;
    await db.from("check_in_attempts").insert({
      property_id: p.id,
      booking_id: hit?.id ?? null,
      surname_attempt: data.letter.toUpperCase(),
      succeeded: Boolean(hit),
      device_hash: hash,
    });

    if (!hit) {
      const nowLocked = await deviceLock(p.id, hash, isTour(p));
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
      returning: found.kind === "match" && found.returning,
      needsName: found.kind === "match" && found.needsName,
      platform: platformKey(hit),
    };
  });

/**
 * Pick-your-booking list, only when the host has switched ID checks off.
 * The guest must give their surname initial first, every lookup counts as an
 * attempt (so the device lock applies), and only matching stays are listed.
 */
const letterField = z.string().regex(/^[A-Za-z]$/);

/**
 * Listed stays are handed out as short-lived, device-bound handles instead of
 * raw booking ids, so pickArrival only accepts stays this device was shown.
 */
async function arrivalHandle(bookingId: string, hash: string): Promise<string> {
  const { createHmac } = await import("crypto");
  const exp = Date.now() + 10 * 60_000;
  const body = `${Buffer.from(bookingId).toString("base64url")}.${exp}`;
  const mac = createHmac("sha256", `arrival:${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""}`).update(`${body}.${hash}`).digest("base64url");
  return `${body}.${mac}`;
}

async function readArrivalHandle(handle: string, hash: string): Promise<string | null> {
  const { createHmac, timingSafeEqual } = await import("crypto");
  const [id64, exp, mac] = handle.split(".");
  if (!id64 || !exp || !mac || Number(exp) < Date.now()) return null;
  const want = createHmac("sha256", `arrival:${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""}`).update(`${id64}.${exp}.${hash}`).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const id = Buffer.from(id64, "base64url").toString();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export const listArrivals = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code, deviceId, channel: channel.optional(), letter: letterField }).parse(d))
  .handler(async ({ data }) => {
    const { admin, deviceHash, loadPropertyByCode } = await srv();
    const p = await loadPropertyByCode(data.code);
    if (!p || !usesListFlow(normaliseMethods(p.checkin_methods))) return { items: [] };
    const hash = deviceHash(p.id, data.deviceId);
    const locked = await deviceLock(p.id, hash, isTour(p));
    if (locked) return { items: [], until: locked.toISOString() };
    const db = await admin();
    const today = todayInZone(p.timezone ?? "Europe/London");
    const { data: rows } = await arrivalsAround(p.id, today, 50);
    const letter = data.letter.toUpperCase();
    const items = arrivalCandidates(rows ?? [], today).filter(
      (b) =>
        b.guest_full_name &&
        surnameInitial(b.guest_full_name) === letter &&
        (!data.channel || platformKey(b) === data.channel),
    );
    await db.from("check_in_attempts").insert({
      property_id: p.id,
      booking_id: null,
      surname_attempt: letter,
      succeeded: items.length > 0,
      device_hash: hash,
    });
    if (items.length === 0) {
      const nowLocked = await deviceLock(p.id, hash, isTour(p));
      if (nowLocked) return { items: [], until: nowLocked.toISOString() };
    }
    return {
      items: await Promise.all(
        items.map(async (b) => ({ id: await arrivalHandle(b.id, hash), label: shortName(b.guest_full_name), checkOut: b.check_out_date, channel: platformKey(b) })),
      ),
    };
  });

export const pickArrival = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ code, deviceId, bookingId: z.string().max(300), letter: letterField }).parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, deviceHash, loadPropertyByCode } = await srv();
    const p = await loadPropertyByCode(data.code);
    if (!p || !usesListFlow(normaliseMethods(p.checkin_methods))) throw new Error("Not available.");
    const hash = deviceHash(p.id, data.deviceId);
    if (await deviceLock(p.id, hash, isTour(p))) throw new Error("Check-in is paused on this device for a few minutes.");
    const bookingId = await readArrivalHandle(data.bookingId, hash);
    if (!bookingId) throw new Error("That stay is not available. Please start again.");
    const db = await admin();
    const today = todayInZone(p.timezone ?? "Europe/London");
    const { withLegacy } = await srv();
    const pickCols = "id, channel, status, check_in_date, check_out_date, guest_full_name, mirror_of";
    const { data: b } = await withLegacy(
      () => db.from("bookings").select(`${pickCols}, site_key`).eq("id", bookingId).eq("property_id", p.id).maybeSingle(),
      () => db.from("bookings").select(pickCols).eq("id", bookingId).eq("property_id", p.id).maybeSingle(),
    );
    const ok =
      !!b &&
      arrivalCandidates([b], today).length === 1 &&
      surnameInitial(b.guest_full_name) === data.letter.toUpperCase();
    await db.from("check_in_attempts").insert({
      property_id: p.id,
      booking_id: ok ? b!.id : null,
      surname_attempt: data.letter.toUpperCase(),
      succeeded: ok,
      device_hash: hash,
    });
    if (!ok || !b) throw new Error("That stay is not available.");
    return { token: await startSession(p.id, b.id), firstName: firstName(b.guest_full_name), platform: platformKey(b) };
  });

/**
 * The stay arrived from a calendar without a guest name, and the host hasn't
 * added one: the guest types it. The host is told, and the usual identity
 * step still follows.
 */
export const setGuestName = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, fullName: z.string().max(100) }).parse(d))
  .handler(async ({ data }) => {
    const name = cleanGuestName(data.fullName);
    if (!name) throw new Error("Please type your first name and surname.");
    const { admin, loadSession, raiseAlert } = await srv();
    const session = await loadSession(data.token);
    const db = await admin();
    const { data: b } = await db
      .from("bookings")
      .select("id, guest_full_name, status, property_id, rooms(display_name), properties(name, host_id)")
      .eq("id", session.booking_id)
      .single();
    if (!b) throw new Error("This check-in has timed out. Please start again.");
    // Only ever fills a gap: a name the host already has is never replaced.
    if (b.guest_full_name?.trim()) return { firstName: firstName(b.guest_full_name) };
    await db
      .from("bookings")
      .update({ guest_full_name: name, ...(b.status === "needs_details" ? { status: "upcoming" as const } : {}) })
      .eq("id", b.id);
    const prop = (b as { properties?: { name: string; host_id: string } | null }).properties;
    const room = (b as { rooms?: { display_name: string } | null }).rooms?.display_name;
    if (prop) {
      await raiseAlert({
        hostId: prop.host_id,
        propertyId: b.property_id,
        bookingId: b.id,
        kind: "self_declared",
        message: `${name} added their own name while checking in at ${prop.name}${room ? ` (${room})` : ""}; the booking had none. Worth a quick check.`,
      });
    }
    return { firstName: firstName(name) };
  });

/* ------------------------------ identity -------------------------------- */

/**
 * Everything a check-in step needs. A guest's phone that joined the check-in
 * (checkin_joins) is only let in where `join` is allowed, and only for its
 * own guest; everywhere else its token is refused.
 */
async function sessionContext(t: string, opts: { join?: boolean; share?: boolean } = {}) {
  const { admin, loadSession, loadSessionById, loadSessionByShare, loadJoin } = await srv();
  let session: Awaited<ReturnType<typeof loadSession>>;
  let join: Awaited<ReturnType<typeof loadJoin>> | null = null;
  if (opts.share) {
    session = await loadSessionByShare(t);
  } else {
    try {
      session = await loadSession(t);
    } catch (err) {
      if (!opts.join) throw err;
      join = await loadJoin(t);
      session = await loadSessionById(join.session_id);
    }
  }
  const db = await admin();
  const { withLegacy } = await srv();
  const bookingCols =
    "id, property_id, guest_full_name, reservation_code, phone_last4, guest_email, check_out_date, room_id, status, channel, guest_count, source, manual_fields";
  const { data: b } = await withLegacy(
    () => db.from("bookings").select(`${bookingCols}, site_key`).eq("id", session.booking_id).single(),
    () => db.from("bookings").select(bookingCols).eq("id", session.booking_id).single(),
  );
  const propertyCols = "id, host_id, name, checkin_methods, is_demo, short_code, timezone, country_code";
  const { data: p } = await withLegacy(
    () => db.from("properties").select(`${propertyCols}, guest_records`).eq("id", session.property_id).single(),
    () => db.from("properties").select(propertyCols).eq("id", session.property_id).single(),
  );
  if (!b || !p) throw new Error("This check-in has timed out. Please start again.");
  const { data: room } = b.room_id
    ? await withLegacy(
        () => db.from("rooms").select("max_guests, children_allowed").eq("id", b.room_id!).maybeSingle(),
        () => db.from("rooms").select("max_guests").eq("id", b.room_id!).maybeSingle(),
      )
    : { data: null };
  // The UK guest register, once migration 0022 has created its table.
  const register = registerApplies(p.country_code)
    ? !(await db.from("guest_register").select("id", { head: true }).limit(1)).error
    : false;
  // Formalities are done when the guest finished a check-in before, or (in the UK) is already on the register.
  // A stay the host simply marked as checked in still has them to do.
  const [{ count: doneBefore }, { count: onRegister }] = await Promise.all([
    db.from("checkin_sessions").select("id", { count: "exact", head: true }).eq("booking_id", b.id).not("completed_at", "is", null).neq("id", session.id),
    register ? db.from("guest_register").select("id", { count: "exact", head: true }).eq("booking_id", b.id) : Promise.resolve({ count: 0 }),
  ]);
  const formalitiesDone = (doneBefore ?? 0) > 0 && (!register || (onRegister ?? 0) > 0);
  // AI ID reading can be switched off site-wide; demo mode and the tour never call it.
  const { hostModes } = await srv();
  const { jobAllowed } = await import("./usage.server");
  const aiOff = (await hostModes(p.host_id)).id_check !== "demo" && !isTour(p) && !(await jobAllowed("ai_id_reading"));
  return {
    db,
    session,
    booking: b,
    property: p,
    room,
    register,
    aiOff,
    join,
    formalitiesDone,
  };
}

type Ctx = Awaited<ReturnType<typeof sessionContext>>;

/** A joined phone may only fill in the guest it picked. */
function ownSlot(ctx: Ctx, position: number) {
  if (ctx.join && ctx.join.position !== position) throw new Error("Not available.");
}

/** What the guest is asked about who's staying, given the host's settings. */
function partyPlan(ctx: Ctx) {
  const rec = normaliseRecords(ctx.property.guest_records);
  // Someone popping back to reread the rules isn't asked again, and nothing
  // new is asked until the database has the columns to keep the answers.
  // A guest's own phone that joined is still filling in, even once the lead has finished.
  // Marked as checked in by the host isn't finished: the guest still gives their details for the register.
  const finished = ctx.booking.status === "checked_in" && ctx.formalitiesDone && !ctx.join;
  const returning = finished || ctx.property.guest_records === undefined;
  // The register needs to know who's here, so it always asks in the UK.
  const register = ctx.register && !finished;
  return {
    ask: (rec.askWhoIsStaying || register) && !returning,
    register,
    booked: bookedPartySize(ctx.booking),
    capacity: ctx.room?.max_guests ?? null,
    childrenAllowed: ctx.room?.children_allowed ?? true,
    everyAdult: rec.checkEveryAdult && !returning && !ctx.aiOff,
    facePhoto: takesFacePhoto(rec) && !returning,
    keepIdPhoto: keepsIdPhoto(rec),
    keepDays: rec.keepDays,
  };
}

/**
 * When the super admin has switched AI ID reading off, the photo step is
 * left out (demo mode and the public tour never call the AI, so they keep it).
 */
async function withoutPhotoIfOff(ctx: Ctx, seq: CheckinMethod[]): Promise<CheckinMethod[]> {
  if (!seq.includes("photo_id")) return seq;
  const { hostModes } = await srv();
  if ((await hostModes(ctx.property.host_id)).id_check === "demo" || isTour(ctx.property)) return seq;
  const { jobAllowed } = await import("./usage.server");
  return (await jobAllowed("ai_id_reading")) ? seq : seq.filter((m) => m !== "photo_id");
}

function last4Kinds(b: { reservation_code: string | null; phone_last4: string | null; guest_email: string | null }) {
  const kinds: Array<"reference" | "phone" | "email"> = [];
  if (b.reservation_code && b.reservation_code.replace(/[^a-z0-9]/gi, "").length >= 4) kinds.push("reference");
  if (b.phone_last4) kinds.push("phone");
  if (b.guest_email) kinds.push("email");
  return kinds;
}

/**
 * What's already done on this stay, so a check-in picked up on another
 * device only asks for what's still missing.
 */
async function progress(ctx: Ctx) {
  const [{ data: people }, { data: entries }] = await Promise.all([
    ctx.db.from("guest_ids").select("position, kind, age, id_checked, skipped").eq("booking_id", ctx.booking.id),
    ctx.register
      ? ctx.db.from("guest_register").select("position").eq("booking_id", ctx.booking.id)
      : Promise.resolve({ data: [] as Array<{ position: number | null }> }),
  ]);
  const rows = people ?? [];
  return {
    childAges: rows
      .filter((r) => r.kind === "child")
      .sort((a, b) => a.position - b.position)
      .map((r) => r.age ?? 0),
    idsDone: rows.filter((r) => r.kind === "adult" && (r.id_checked || r.skipped)).map((r) => r.position),
    registered: (entries ?? []).map((r) => r.position).filter((x): x is number => x !== null),
  };
}

export const confirmBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token);
    const { db, session, booking, property } = ctx;
    await db.from("checkin_sessions").update({ confirmed: true }).eq("id", session.id);
    const methods = normaliseMethods(property.checkin_methods);
    const kinds = last4Kinds(booking);
    return {
      listFlow: usesListFlow(methods),
      sequence: usesListFlow(methods)
        ? (["self_declare"] as const)
        : (await withoutPhotoIfOff(ctx, methodSequence(methods, { last4: kinds.length > 0 }))),
      last4Kinds: kinds,
      party: partyPlan(ctx),
    };
  });

/**
 * Picks a check-in back up on another device. The QR on the first screen
 * carries the session token, so the guest can move from the kiosk to their
 * phone (or hand it to a companion) without entering anything again.
 */
export const resumeSession = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token);
    const { session, booking, property } = ctx;
    const methods = normaliseMethods(property.checkin_methods);
    const kinds = last4Kinds(booking);
    return {
      firstName: firstName(booking.guest_full_name) || "there",
      platform: platformKey(booking),
      party: partyPlan(ctx),
      adults: session.adults ?? null,
      ...(await progress(ctx)),
      confirmed: session.confirmed,
      completed: session.completed_at !== null,
      verified: session.verified_method !== null,
      listFlow: usesListFlow(methods),
      sequence: usesListFlow(methods)
        ? (["self_declare"] as const)
        : (await withoutPhotoIfOff(ctx, methodSequence(methods, { last4: kinds.length > 0 }))),
      last4Kinds: kinds,
    };
  });


async function recordResult(
  ctx: Ctx,
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

/**
 * What the register form starts with, from the guest's own ID. Only sent
 * back to the device that just photographed it.
 */
function prefillFrom(read: IdRead) {
  return {
    fullName: read.fullName,
    nationality: nationalityFromId(read.nationality),
    documentNumber: read.documentNumber,
    placeOfIssue: read.placeOfIssue ?? read.issuingCountry,
  };
}

/** Property-wide cap on paid ID reads per hour, so new sessions can't run up AI charges. */
async function readsLeftThisHour(ctx: Ctx): Promise<boolean> {
  const { data: recent } = await ctx.db
    .from("checkin_sessions")
    .select("photo_attempts, companion_attempts")
    .eq("property_id", ctx.property.id)
    .gt("created_at", new Date(Date.now() - 3_600_000).toISOString())
    .limit(500);
  const used = ((recent ?? []) as Array<{ photo_attempts: number | null; companion_attempts?: number | null }>).reduce(
    (n, r) => n + (r.photo_attempts ?? 0) + (r.companion_attempts ?? 0),
    0,
  );
  return used < 30;
}

/**
 * Reads an ID photo. Demo mode and the public tour skip the AI call: the
 * lead booker's "ID" shows the booking name, anyone else gets a sample name.
 */
async function readId(ctx: Ctx, image: string, position: number): Promise<IdRead> {
  const { readIdDetails, hostModes } = await srv();
  const modes = await hostModes(ctx.property.host_id);
  if (modes.id_check === "demo" || isTour(ctx.property)) {
    return {
      isIdDocument: true,
      hasHolderPhoto: true,
      looksHomemade: false,
      documentType: "passport",
      fullName: position === 0 ? ctx.booking.guest_full_name : `Sample Guest ${position + 1}`,
      dateOfBirth: "1990-01-01",
      expiryDate: "2031-01-01",
      issuingCountry: "United Kingdom",
      numberLast4: "0000",
      nationality: "GBR",
      documentNumber: null,
      placeOfIssue: null,
    };
  }
  const { bumpUsage } = await import("./usage.server");
  await bumpUsage(ctx.property.host_id, "ai:id_read");
  return readIdDetails(image);
}

/**
 * One person's record for the host: key details from their ID and, when the
 * host keeps them, small photos. The public tour never keeps photos.
 */
async function savePerson(
  ctx: Ctx,
  position: number,
  fields: {
    kind: "adult" | "child";
    age?: number | null;
    read?: IdRead | null;
    nameMatch?: "matched" | "partial" | "not_matched" | null;
    idChecked?: boolean;
    skipped?: boolean;
    idPhoto?: string | null;
    facePhoto?: string | null;
    /** Typed by the guest (a joined phone with no ID to read, or a child's name). */
    fullName?: string | null;
  },
) {
  const { storeGuestPhoto, removeGuestPhotos } = await srv();
  const rec = normaliseRecords(ctx.property.guest_records);
  const tour = isTour(ctx.property);
  const { data: existing } = await ctx.db
    .from("guest_ids")
    .select("id, id_photo_path, face_photo_path")
    .eq("booking_id", ctx.booking.id)
    .eq("position", position)
    .maybeSingle();
  const prev = existing as { id: string; id_photo_path: string | null; face_photo_path: string | null } | null;

  const row: Record<string, unknown> = {
    booking_id: ctx.booking.id,
    property_id: ctx.property.id,
    position,
    kind: fields.kind,
    delete_after: deleteAfter(ctx.booking.check_out_date, rec.keepDays),
  };
  if (fields.kind === "child") Object.assign(row, { age: fields.age ?? null });
  if (fields.read) {
    const r = fields.read;
    Object.assign(row, {
      full_name: r.fullName,
      document_type: r.documentType,
      issuing_country: r.issuingCountry,
      date_of_birth: r.dateOfBirth,
      document_expiry: r.expiryDate,
      document_last4: r.numberLast4,
    });
  } else if (fields.fullName) {
    row["full_name"] = fields.fullName;
  } else if (position === 0 && !prev) {
    row["full_name"] = ctx.booking.guest_full_name;
  }
  if (fields.nameMatch !== undefined) row["name_match"] = fields.nameMatch;
  if (fields.idChecked !== undefined) row["id_checked"] = fields.idChecked;
  if (fields.skipped !== undefined) row["skipped"] = fields.skipped;

  const stale: string[] = [];
  if (fields.idPhoto && keepsIdPhoto(rec) && !tour) {
    row["id_photo_path"] = await storeGuestPhoto(ctx.booking.id, "id", fields.idPhoto);
    if (prev?.id_photo_path) stale.push(prev.id_photo_path);
  }
  if (fields.facePhoto && takesFacePhoto(rec) && !tour) {
    row["face_photo_path"] = await storeGuestPhoto(ctx.booking.id, "face", fields.facePhoto);
    if (prev?.face_photo_path) stale.push(prev.face_photo_path);
  }

  const { error } = prev
    ? await ctx.db.from("guest_ids").update(row as never).eq("id", prev.id)
    : await ctx.db.from("guest_ids").insert(row as never);
  if (error) {
    console.error("guest_ids save failed", error.message);
    throw new Error("We couldn't save that. Please try again.");
  }
  await removeGuestPhotos(stale);
}

export const verifyPhotoId = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, image: jpeg, small: smallJpeg.optional() }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token);
    const methods = normaliseMethods(ctx.property.checkin_methods);
    if (!ctx.session.confirmed || !methods.enabled.photo_id) throw new Error("Not available.");
    if (ctx.aiOff || ctx.session.photo_attempts >= MAX_PHOTO_ATTEMPTS) return { status: "fallback" as const };
    if (!(await readsLeftThisHour(ctx))) return { status: "fallback" as const };

    await ctx.db
      .from("checkin_sessions")
      .update({ photo_attempts: ctx.session.photo_attempts + 1 })
      .eq("id", ctx.session.id);
    const left = MAX_PHOTO_ATTEMPTS - ctx.session.photo_attempts - 1;
    const again = (reason: "unreadable" | "not_photo_id") =>
      left > 0 ? { status: "retry" as const, left, reason } : { status: "fallback" as const };

    let read: IdRead;
    try {
      read = await readId(ctx, data.image, 0);
    } catch {
      return again("unreadable");
    }
    const tz = ctx.property.timezone ?? "Europe/London";
    const verdict = judgeId(read, todayInZone(tz));
    if (!verdict.ok) return again(verdict.reason);

    const result = compareNames(ctx.booking.guest_full_name, read.fullName);
    try {
      await savePerson(ctx, 0, {
        kind: "adult",
        read,
        nameMatch: result,
        idChecked: true,
        skipped: false,
        idPhoto: data.small ?? null,
      });
    } catch (err) {
      // The check itself passed; a failed save must not stop the guest at the door.
      console.error("Saving lead guest ID failed", err);
    }
    await recordResult(ctx, "photo_id", result);
    if (verdict.expired) {
      const { raiseAlert } = await srv();
      await raiseAlert({
        hostId: ctx.property.host_id,
        propertyId: ctx.property.id,
        bookingId: ctx.booking.id,
        kind: "id_partial",
        message: `${firstName(ctx.booking.guest_full_name) || "A guest"} showed an expired ID at ${ctx.property.name}.`,
      });
    }
    return { status: "done" as const, result, prefill: prefillFrom(read) };
  });

/**
 * How many adults and children arrived, and each child's age. Children never
 * show ID. Hosts are told when the count differs from the booking or is more
 * than the room sleeps; the guest is never stopped at the door over it.
 */
export const setParty = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        adults: z.number().int().min(1).max(30),
        childAges: z.array(z.number().int().min(0).max(ADULT_AGE - 1)).max(29),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token);
    if (!ctx.session.confirmed) throw new Error("Not available.");
    const plan = partyPlan(ctx);
    const check = checkParty({
      adults: data.adults,
      childAges: data.childAges,
      booked: plan.booked,
      capacity: plan.capacity,
      childrenAllowed: plan.childrenAllowed,
    });
    if (check.total > 30) throw new Error("Please call your host.");

    await ctx.db
      .from("checkin_sessions")
      .update({ adults: data.adults, children: data.childAges.length })
      .eq("id", ctx.session.id);
    await ctx.db
      .from("bookings")
      .update({ arrived_adults: data.adults, arrived_children: data.childAges.length })
      .eq("id", ctx.booking.id);

    // Fresh list of who's here: drop anyone beyond the new count.
    const { data: old } = await ctx.db
      .from("guest_ids")
      .select("id, position, kind, id_photo_path, face_photo_path")
      .eq("booking_id", ctx.booking.id);
    const rows = (old ?? []) as Array<{ id: string; position: number; kind: string; id_photo_path: string | null; face_photo_path: string | null }>;
    const drop = rows.filter((r) => r.position >= data.adults);
    if (drop.length) {
      const { removeGuestPhotos } = await srv();
      await ctx.db.from("guest_ids").delete().in("id", drop.map((r) => r.id));
      await removeGuestPhotos(drop.flatMap((r) => [r.id_photo_path, r.face_photo_path].filter((x): x is string => !!x)));
    }
    for (const [i, age] of data.childAges.entries()) {
      await savePerson(ctx, data.adults + i, { kind: "child", age });
    }

    const problems = [
      check.differsFromBooking ? `${check.total} people arrived; the booking says ${plan.booked}` : null,
      check.overCapacity ? `the room sleeps ${plan.capacity}` : null,
      check.childrenNotAllowed ? "children arrived in an adults-only room" : null,
    ].filter(Boolean);
    if (problems.length) {
      const { raiseAlert } = await srv();
      await raiseAlert({
        hostId: ctx.property.host_id,
        propertyId: ctx.property.id,
        bookingId: ctx.booking.id,
        kind: "party",
        message: `${firstName(ctx.booking.guest_full_name) || "A guest"} at ${ctx.property.name}: ${problems.join("; ")}.`,
      });
    }
    return { ok: true as const, ...check, booked: plan.booked, capacity: plan.capacity };
  });

/** An extra adult photographs their own ID after the lead booker. */
export const checkCompanionId = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token, position: z.number().int().min(1).max(29), image: jpeg, small: smallJpeg.optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token, { join: true });
    ownSlot(ctx, data.position);
    const plan = partyPlan(ctx);
    const adults = ctx.session.adults ?? 1;
    if (!ctx.session.confirmed || !plan.everyAdult || data.position >= adults) throw new Error("Not available.");
    const used = ctx.session.companion_attempts ?? 0;
    // Three tries per extra adult, then they're asked to see the host.
    if (used >= Math.min(3 * (adults - 1), 12) || !(await readsLeftThisHour(ctx))) return { status: "skip" as const };
    await ctx.db
      .from("checkin_sessions")
      .update({ companion_attempts: used + 1 })
      .eq("id", ctx.session.id);

    let read: IdRead;
    try {
      read = await readId(ctx, data.image, data.position);
    } catch {
      return { status: "retry" as const, reason: "unreadable" as const };
    }
    const today = todayInZone(ctx.property.timezone ?? "Europe/London");
    const verdict = judgeId(read, today);
    if (!verdict.ok) return { status: "retry" as const, reason: verdict.reason };

    const age = ageOn(read.dateOfBirth, today);
    await savePerson(ctx, data.position, {
      kind: "adult",
      read,
      nameMatch: null,
      idChecked: true,
      skipped: false,
      idPhoto: data.small ?? null,
    });
    return {
      status: "done" as const,
      firstName: firstName(read.fullName),
      under18: age !== null && age < ADULT_AGE,
      prefill: prefillFrom(read),
    };
  });

/** No ID to hand: the host is told and will check in person. */
export const skipCompanionId = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, position: z.number().int().min(1).max(29) }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token, { join: true });
    ownSlot(ctx, data.position);
    if (!ctx.session.confirmed || data.position >= (ctx.session.adults ?? 1)) throw new Error("Not available.");
    await savePerson(ctx, data.position, { kind: "adult", idChecked: false, skipped: true });
    const { raiseAlert } = await srv();
    await raiseAlert({
      hostId: ctx.property.host_id,
      propertyId: ctx.property.id,
      bookingId: ctx.booking.id,
      kind: "self_declared",
      message: `Adult ${data.position + 1} with ${firstName(ctx.booking.guest_full_name) || "a guest"} at ${ctx.property.name} didn't show ID. Please check it in person.`,
    });
    return { ok: true as const };
  });

/**
 * One person's entry in the UK guest register: full name and nationality for
 * everyone 16 or over, plus document number, place of issue and next
 * destination for guests who aren't British, Irish or Commonwealth citizens.
 */
export const saveRegister = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        position: z.number().int().min(0).max(29),
        fullName: z.string().max(200),
        nationality: z.string().max(10),
        documentNumber: z.string().max(60).nullish(),
        placeOfIssue: z.string().max(120).nullish(),
        nextDestination: z.string().max(200).nullish(),
        nextAddress: z.string().max(400).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token, { join: true });
    ownSlot(ctx, data.position);
    if (!ctx.session.confirmed || !partyPlan(ctx).register) throw new Error("Not available.");
    const adults = Math.max(1, ctx.session.adults ?? 1);
    if (data.position >= adults) {
      // Children are only registered from 16.
      const { data: child } = await ctx.db
        .from("guest_ids")
        .select("age")
        .eq("booking_id", ctx.booking.id)
        .eq("position", data.position)
        .maybeSingle();
      if (!child || (child.age ?? 0) < REGISTER_AGE) throw new Error("Not available.");
    }
    const clean = cleanRegisterEntry(data);
    if (!clean.ok) return { ok: false as const, missing: clean.missing };
    // The public tour never keeps what visitors type.
    if (isTour(ctx.property)) return { ok: true as const };

    const e = clean.entry;
    const arrival = todayInZone(ctx.property.timezone ?? "Europe/London");
    const { data: room } = ctx.booking.room_id
      ? await ctx.db.from("rooms").select("display_name").eq("id", ctx.booking.room_id).maybeSingle()
      : { data: null };
    const row = {
      host_id: ctx.property.host_id,
      property_id: ctx.property.id,
      property_name: ctx.property.name,
      booking_id: ctx.booking.id,
      room_name: room?.display_name ?? null,
      position: data.position,
      arrival_date: arrival,
      full_name: e.fullName,
      nationality: e.nationality,
      is_alien: e.alien,
      document_number: e.documentNumber,
      place_of_issue: e.placeOfIssue,
      next_destination: e.nextDestination,
      next_address: e.nextAddress,
      source: "guest",
      keep_until: registerKeepUntil(arrival),
    };
    const { data: prev } = await ctx.db
      .from("guest_register")
      .select("id")
      .eq("booking_id", ctx.booking.id)
      .eq("position", data.position)
      .maybeSingle();
    const { error } = prev
      ? await ctx.db.from("guest_register").update(row).eq("id", prev.id)
      : await ctx.db.from("guest_register").insert(row);
    if (error) {
      console.error("guest_register save failed", error.message);
      throw new Error("We couldn't save that. Please try again.");
    }
    return { ok: true as const };
  });

/** A quick face photo, kept small, so the host knows who to expect. */
export const addFacePhoto = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, position: z.number().int().min(0).max(29), image: smallJpeg }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token, { join: true });
    ownSlot(ctx, data.position);
    if (!ctx.session.confirmed || data.position >= Math.max(1, ctx.session.adults ?? 1)) throw new Error("Not available.");
    if (!partyPlan(ctx).facePhoto) return { ok: true as const };
    await savePerson(ctx, data.position, { kind: "adult", facePhoto: data.image });
    return { ok: true as const };
  });

/* ------------------------- other guests' own phones ------------------------ */

const STALE_CLAIM_MS = 20 * 60_000;
/** checkin_joins and share_hash are from migration 0037, newer than the generated types. */
type Loose = { from: (t: string) => any };

type SlotState = "open" | "phone" | "done";
type Slot = { position: number; kind: "adult" | "child"; age: number | null; state: SlotState };

/**
 * Every guest after the lead booker, and whether each is still to fill in,
 * being filled in on someone's phone, or done (on a phone or this screen).
 */
async function slotsFor(ctx: Ctx): Promise<Slot[]> {
  const plan = partyPlan(ctx);
  const adults = Math.max(1, ctx.session.adults ?? 1);
  const children = ctx.session.children ?? 0;
  const [{ data: people }, { data: entries }, { data: claims }] = await Promise.all([
    ctx.db.from("guest_ids").select("position, kind, age, full_name, id_checked, skipped, face_photo_path").eq("booking_id", ctx.booking.id),
    ctx.register ? ctx.db.from("guest_register").select("position").eq("booking_id", ctx.booking.id) : Promise.resolve({ data: [] as Array<{ position: number | null }> }),
    (ctx.db as unknown as Loose).from("checkin_joins").select("position, claimed_at, done_at").eq("session_id", ctx.session.id),
  ]);
  const person = new Map(((people ?? []) as Array<Record<string, any>>).map((r) => [r["position"] as number, r]));
  const registered = new Set(((entries ?? []) as Array<{ position: number | null }>).map((r) => r.position));
  const claim = new Map(((claims ?? []) as Array<{ position: number; claimed_at: string; done_at: string | null }>).map((c) => [c.position, c]));
  const out: Slot[] = [];
  for (let position = 1; position < adults + children; position++) {
    const kind = position < adults ? "adult" : "child";
    const p = person.get(position);
    const age = kind === "child" ? ((p?.["age"] as number | null) ?? null) : null;
    const c = claim.get(position);
    const filled =
      kind === "adult"
        ? (!plan.everyAdult || !!p?.["id_checked"] || !!p?.["skipped"]) &&
          (!plan.register || registered.has(position)) &&
          (plan.everyAdult || plan.register || !!p?.["full_name"])
        : !!p?.["full_name"] && (!plan.register || (age ?? 0) < REGISTER_AGE || registered.has(position));
    const state: SlotState = c?.done_at || filled ? "done" : c && Date.now() - Date.parse(c.claimed_at) < STALE_CLAIM_MS ? "phone" : "open";
    out.push({ position, kind, age, state });
  }
  return out;
}

/** The square other guests scan: a fresh share code for this check-in (the lead's screen only). */
export const shareCheckIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token);
    if (!ctx.session.confirmed) throw new Error("Not available.");
    const { newToken } = await srv();
    const share = newToken();
    await (ctx.db as unknown as Loose).from("checkin_sessions").update({ share_hash: share.hash }).eq("id", ctx.session.id);
    return { share: share.token };
  });

/** For the lead's screen: who is filling in on their own phone, and who's done. */
export const checkInProgress = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token);
    return { slots: await slotsFor(ctx) };
  });

/** A guest's phone opened the square: whose check-in it is, and which kinds of guest are still to fill in. */
export const joinInfo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ share: token }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.share, { share: true });
    if (!ctx.session.confirmed) throw new Error("Not available.");
    const slots = await slotsFor(ctx);
    return {
      leadFirstName: firstName(ctx.booking.guest_full_name) || null,
      propertyName: ctx.property.name,
      openAdults: slots.filter((x) => x.kind === "adult" && x.state === "open").length,
      openChildren: slots.filter((x) => x.kind === "child" && x.state === "open").length,
    };
  });

/**
 * A guest's phone picks "adult" or "child": it gets the next guest of that
 * kind still to fill in, and its own token for just that guest. Several
 * phones can do this at once; each gets a different guest.
 */
export const joinCheckIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ share: token, kind: z.enum(["adult", "child"]) }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.share, { share: true });
    if (!ctx.session.confirmed) throw new Error("Not available.");
    // Phones that picked a guest and went quiet free that guest again.
    await (ctx.db as unknown as Loose)
      .from("checkin_joins")
      .delete()
      .eq("session_id", ctx.session.id)
      .is("done_at", null)
      .lt("claimed_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString());
    const { newToken } = await srv();
    for (const slot of (await slotsFor(ctx)).filter((x) => x.kind === data.kind && x.state === "open")) {
      const mine = newToken();
      const { error } = await (ctx.db as unknown as Loose)
        .from("checkin_joins")
        .insert({ session_id: ctx.session.id, position: slot.position, kind: slot.kind, token_hash: mine.hash });
      // Another phone took this one a moment ago: try the next.
      if (error) continue;
      const plan = partyPlan({ ...ctx, join: { id: "", session_id: ctx.session.id, position: slot.position, kind: slot.kind, done_at: null } });
      return {
        status: "joined" as const,
        token: mine.token,
        position: slot.position,
        kind: slot.kind,
        age: slot.age,
        number: slot.position + 1,
        plan: { everyAdult: plan.everyAdult, register: plan.register, facePhoto: plan.facePhoto, keepIdPhoto: plan.keepIdPhoto, keepDays: plan.keepDays },
      };
    }
    return { status: "full" as const };
  });

/** A joined phone's guest gives their name (and a child's age), when there's no ID to read it from. */
export const joinPerson = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token, fullName: z.string().trim().min(1).max(200), age: z.number().int().min(0).max(ADULT_AGE - 1).nullish() }).parse(d),
  )
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token, { join: true });
    if (!ctx.join) throw new Error("Not available.");
    if (ctx.join.kind === "child") {
      await savePerson(ctx, ctx.join.position, { kind: "child", age: data.age ?? null, fullName: data.fullName });
    } else {
      await savePerson(ctx, ctx.join.position, { kind: "adult", fullName: data.fullName });
    }
    return { ok: true as const };
  });

/** A joined phone has finished its guest. */
export const joinDone = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await sessionContext(data.token, { join: true });
    if (!ctx.join) throw new Error("Not available.");
    await (ctx.db as unknown as Loose).from("checkin_joins").update({ done_at: new Date().toISOString() }).eq("id", ctx.join.id);
    return { ok: true as const };
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
      valid_from: win.validFrom.toISOString(),
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
      .select("guest_full_name, check_in_date, check_out_date, check_in_time, check_out_time, room_id, property_id, status, channel, site_key")
      .eq("id", t.booking_id)
      .single();
    if (!b || b.status === "cancelled") return { found: false as const };
    const [{ data: p }, { data: room }, { data: guides }, { data: windows }] = await Promise.all([
      db
        .from("properties")
        .select("name, host_id, is_demo, short_code, timezone, default_check_in_time, default_check_out_time, quiet_hours_start, quiet_hours_end, wifi_name, wifi_password, parking_notes, host_contact_name, host_contact_phone, theme_config, country_code")
        .eq("id", b.property_id)
        .single(),
      b.room_id
        ? db.from("rooms").select("display_name, public_title, description, has_ensuite, guide_mode, amenities").eq("id", b.room_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from("guides")
        .select("room_id, section_key, title, summary, published, pinned, sort_order, guide_steps(heading, body, image_url, sort_order)")
        .eq("property_id", b.property_id)
        // Removed sections come too, so they stay out even where Latchkey could fill them in.
        .not("section_key", "is", null),
      db
        .from("unavailability_windows")
        .select("room_id, reason, starts_at, ends_at, day_of_week, start_time, end_time")
        .eq("property_id", b.property_id),
    ]);

    const { buildGuide, forgetCard, weeklyLines, windowsOn, guideWindow, DOOR_SECTIONS } = await import("./guide");
    const tz = p?.timezone ?? "Europe/London";
    const today = todayInZone(tz);
    const checkOutTime = (b.check_out_time ?? p?.default_check_out_time ?? "11:00").slice(0, 5);
    // Room QR and Wi-Fi settings (migration 0057): the room's own network, the password after check-in if the host asks.
    const checkedIn = b.status === "checked_in" || b.status === "checked_out";
    // Still to do: check-in itself, or (in the UK) the guest register, even when the host has marked the stay as checked in.
    const { count: onRegister, error: regError } = registerApplies((p as { country_code?: string | null } | null)?.country_code ?? null)
      ? await db.from("guest_register").select("id", { count: "exact", head: true }).eq("booking_id", t.booking_id)
      : { count: 1, error: null };
    const registerMissing = !regError && (onRegister ?? 0) === 0;
    // The public tour keeps no register and puts today's arrival back for the next
    // visitor, so there a finished check-in session for the stay is what counts.
    const tour = p ? isTour(p as { is_demo?: boolean | null; short_code?: string | null }) : false;
    const tourDone = tour
      ? ((
          await db.from("checkin_sessions").select("id", { count: "exact", head: true }).eq("booking_id", t.booking_id).not("completed_at", "is", null)
        ).count ?? 0) > 0
      : false;
    const { stayAccessFor, guestWifi } = await import("./stay-access.server");
    const { stayProgress } = await import("./stay-access");
    const access = await stayAccessFor(db as never, b.property_id);
    const wifi = p ? await guestWifi(db as never, { id: b.property_id, wifi_name: p.wifi_name, wifi_password: p.wifi_password }, b.room_id, checkedIn, access) : null;
    const facts = {
      wifiName: wifi?.name ?? null,
      wifiPassword: wifi?.password ?? null,
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
    const win = guideWindow(b.check_in_date, b.check_out_date, checkOutTime, tz);
    const doorLocked = Date.now() < win.doorOpensAt.getTime();
    const readOnly = Date.now() >= win.readOnlyAt.getTime();
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
      pinned: g.pinned === true,
      sortOrder: g.sort_order ?? 0,
      title: g.title,
      published: g.published !== false,
      steps: [...(g.guide_steps ?? [])]
        .sort((a, c) => a.sort_order - c.sort_order)
        .map((s) => ({ heading: s.heading, body: s.body, imageUrl: s.image_url ? (signed[s.image_url] ?? null) : null })),
    }));

    const { startersOffForProperty } = await import("./guide-starters.server");
    const { attachmentsFor } = await import("./attachments.server");
    const { tilesForGuest, roomPhoto } = await import("./guide-tiles.server");
    const [off, files, tiles, photo] = await Promise.all([
      startersOffForProperty(b.property_id),
      attachmentsFor(b.property_id).catch(() => ({}) as Record<string, never>),
      tilesForGuest(b.property_id),
      roomPhoto(b.room_id),
    ]);
    const sections = buildGuide(stored, b.room_id, mode, facts, off, Object.keys(files)).map((sec) =>
      doorLocked && DOOR_SECTIONS.includes(sec.key)
        ? { ...sec, summary: "DOOR_LOCKED", steps: [], attachments: [] }
        : { ...sec, attachments: (files as Record<string, import("./attachments.server").GuestAttachment[]>)[sec.key] ?? [] },
    );
    const forget = forgetCard(sections, windowsOn(windows ?? [], b.room_id, today, tz));
    // Anything on the reminder card is left out of the list below, so guests
    // never read the same rule twice.
    const reminded = new Set(forget.map((i) => i.key));

    return {
      found: true as const,
      propertyId: b.property_id,
      firstName: firstName(b.guest_full_name),
      checkInDate: b.check_in_date as string,
      checkInTime: ((b as { check_in_time?: string | null }).check_in_time ?? (p as { default_check_in_time?: string } | null)?.default_check_in_time ?? "15:00").slice(0, 5),
      checkOutDate: b.check_out_date,
      checkOutTime,
      // The Wi-Fi is sent once, in `wifi`, never as the property's own columns.
      property: p ? { ...p, wifi_name: null, wifi_password: null } : p,
      room,
      wifi,
      checkedIn,
      needsCheckIn: tour ? !tourDone && !checkedIn : b.status !== "checked_out" && (!checkedIn || registerMissing),
      progress: stayProgress(b.check_in_date, b.check_out_date, today),
      stayMessage: access.stayMessage,
      // The last day's review nudge: the site they booked with (its logo and name), or here for direct stays.
      review: access.askReview
        ? {
            text: access.reviewText,
            direct: b.channel === "direct",
            showsOnPage: access.showDirectReviews,
            site: await (async () => {
              const { resolveSites, platformKey } = await import("./booking-sites");
              const { channels } = await import("@/content/copy");
              const { data: h } = await db.from("hosts").select("channel_labels, booking_sites").eq("id", (p as { host_id?: string } | null)?.host_id ?? "").maybeSingle();
              const key = platformKey(b as { channel: string; site_key?: string | null });
              const site = resolveSites((h as { channel_labels?: Record<string, string> } | null)?.channel_labels, (h as { booking_sites?: unknown } | null)?.booking_sites, channels as Record<string, string>).find((x) => x.key === key);
              return { key: b.channel as string, label: site?.label ?? (channels as Record<string, string>)[b.channel] ?? "", iconUrl: site?.iconUrl ?? null };
            })(),
          }
        : null,
      amenities: Array.isArray((room as { amenities?: unknown } | null)?.amenities)
        ? ((room as { amenities: unknown[] }).amenities.filter((a): a is string => typeof a === "string"))
        : [],
      theme: await withGroup(normaliseTheme(p?.theme_config), (p as { host_id?: string } | null)?.host_id, p?.name ?? ""),
      /** A public demo stay (the guest tour): its demo property's code, for the demo panel. */
      demoCode: p && isTour(p as { is_demo?: boolean | null; short_code?: string | null }) ? ((p as { short_code?: string }).short_code ?? null) : null,
      mode,
      guide: sections.filter((sec) => !reminded.has(sec.key)),
      pinnedSections: sections.filter((sec) => reminded.has(sec.key)),
      doorOpensAt: win.doorOpensAt.toISOString(),
      readOnly,
      forget,
      tiles,
      roomPhoto: photo,
    };
  });

/**
 * "Finish checking in" from the guest's own stay guide: a check-in for their
 * stay, so the kiosk screen on their phone starts at "Is this you?" instead
 * of finding the booking. They still confirm who they are as usual.
 */
export const startCheckInFromStay = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { admin, sha256 } = await srv();
    const db = await admin();
    const { data: t } = await db.from("stay_tokens").select("booking_id, expires_at").eq("token_hash", sha256(data.token)).maybeSingle();
    if (!t || Date.parse(t.expires_at) < Date.now()) throw new Error("This guide link has ended.");
    const { data: b } = await db.from("bookings").select("id, property_id, status, properties(short_code)").eq("id", t.booking_id).maybeSingle();
    if (!b || b.status === "cancelled") throw new Error("This stay can't be checked in.");
    const code = (b as { properties?: { short_code: string } | null }).properties?.short_code;
    if (!code) throw new Error("This stay can't be checked in.");
    return { code, session: await startSession(b.property_id, b.id) };
  });

/* ------------------------------- handover -------------------------------- */

/**
 * The guest would rather be checked in by the host, at any step. The host is
 * told who it is when we know, and the stay is left for them to finish.
 * Rate-limited so a kiosk can't flood the host with alerts.
 */
export const askHostToCheckIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code, token: token.optional() }).parse(d))
  .handler(async ({ data }) => {
    const { admin, loadPropertyByCode, raiseAlert, loadSession } = await srv();
    const p = await loadPropertyByCode(data.code);
    if (!p) throw new Error("We could not find this property.");
    if (isTour(p)) return { ok: true as const };
    const db = await admin();

    let who = "A guest";
    let room: string | null = null;
    let bookingId: string | null = null;
    if (data.token) {
      try {
        const session = await loadSession(data.token);
        if (session.property_id === p.id) {
          const { data: b } = await db
            .from("bookings")
            .select("id, guest_full_name, rooms(display_name)")
            .eq("id", session.booking_id)
            .maybeSingle();
          if (b) {
            bookingId = b.id;
            who = b.guest_full_name?.trim() || who;
            room = (b as { rooms?: { display_name: string } | null }).rooms?.display_name ?? null;
          }
        }
      } catch {
        // Timed out: still tell the host someone needs them.
      }
    }

    // Once per stay every few minutes, and at most a few anonymous ones.
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const recent = db
      .from("host_alerts")
      .select("id", { count: "exact", head: true })
      .eq("property_id", p.id)
      .eq("kind", "handover")
      .gt("created_at", since);
    const { count } = await (bookingId ? recent.eq("booking_id", bookingId) : recent.is("booking_id", null));
    if ((count ?? 0) >= (bookingId ? 1 : 3)) return { ok: true as const };

    await raiseAlert({
      hostId: p.host_id,
      propertyId: p.id,
      bookingId,
      kind: "handover",
      message: `${who}${room ? ` (${room})` : ""} would like you to check them in at ${p.name}.`,
    });
    return { ok: true as const };
  });

/* -------------------------------- kiosk --------------------------------- */

export const kioskUnlock = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code, pin: z.string().regex(/^\d{4,8}$/), pair: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { loadPropertyByCode, admin } = await srv();
    await new Promise((r) => setTimeout(r, 600));
    const p = await loadPropertyByCode(data.code);
    const ok = Boolean(p && p.check_in_pin && p.check_in_pin === data.pin);
    // The host's PIN on a door tablet also pairs it, so room QR codes can tell a guest is here (src/lib/stay-access.functions.ts).
    let device: string | null = null;
    if (ok && data.pair && p && !isTour(p)) {
      const { pairDevice } = await import("./stay-access.functions");
      device = await pairDevice((await admin()) as never, p.id, "pin").catch(() => null);
    }
    return { ok, device };
  });
