/* eslint-disable @typescript-eslint/no-explicit-any -- reads columns the generated Supabase types don't cover yet */
/**
 * The check-out goodbye (src/lib/checkout-goodbye.ts, migration 0068): the
 * host's settings, what the door tablet shows now, Express check-out from
 * the tablet or the guest guide, and the host taking a goodbye off.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LATE_LEAD_CHOICES,
  START_CHOICES,
  arrivalStart,
  arrivalText,
  goodbyeText,
  goodbyeWindow,
  normaliseArrivals,
  normaliseGoodbye,
  showsArrival,
  showsGoodbyeNow,
} from "@/lib/checkout-goodbye";
import { firstName } from "@/lib/checkin-logic";
import { todayInZone } from "@/lib/dates";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const code = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/i);

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** A stay handed to the tablet as a short-lived signed handle, never its id. */
async function handleFor(bookingId: string, propertyId: string): Promise<string> {
  const { createHmac } = await import("crypto");
  const exp = Date.now() + 12 * 3_600_000;
  const body = `${Buffer.from(bookingId).toString("base64url")}.${exp}`;
  const mac = createHmac("sha256", `goodbye:${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""}`)
    .update(`${body}.${propertyId}`)
    .digest("base64url");
  return `${body}.${mac}`;
}

async function readHandle(handle: string, propertyId: string): Promise<string | null> {
  const { createHmac, timingSafeEqual } = await import("crypto");
  const [id64, exp, mac] = handle.split(".");
  if (!id64 || !exp || !mac || Number(exp) < Date.now()) return null;
  const want = createHmac("sha256", `goodbye:${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""}`)
    .update(`${id64}.${exp}.${propertyId}`)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const id = Buffer.from(id64, "base64url").toString();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

const goodbyeInput = z.object({
  on: z.boolean(),
  message: z.string().max(300),
  keyDrop: z.string().max(300),
  lockDoor: z.boolean(),
  startBeforeMinutes: z.number().refine((n) => (START_CHOICES as readonly number[]).includes(n)),
  lateLeadMinutes: z.number().refine((n) => (LATE_LEAD_CHOICES as readonly number[]).includes(n)),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const arrivalsInput = z.object({
  on: z.boolean(),
  message: z.string().max(300),
  startBeforeMinutes: z.number().refine((n) => (START_CHOICES as readonly number[]).includes(n)),
  startAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  earlyLeadMinutes: z.number().refine((n) => (LATE_LEAD_CHOICES as readonly number[]).includes(n)),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

/** Both kinds of card for a property: check-in (arrivals) and check-out (goodbye). */
export const getGoodbyeSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: p, error } = await sb
      .from("properties")
      .select("checkout_goodbye, checkin_welcome")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error)
      return {
        available: false as const,
        goodbye: normaliseGoodbye(null),
        arrivals: normaliseArrivals(null),
      };
    return {
      available: true as const,
      goodbye: normaliseGoodbye(p?.checkout_goodbye),
      arrivals: normaliseArrivals(p?.checkin_welcome),
    };
  });

export const saveGoodbyeSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        goodbye: goodbyeInput.optional(),
        arrivals: arrivalsInput.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { error } = await (context.supabase as any)
      .from("properties")
      .update({
        ...(data.goodbye ? { checkout_goodbye: normaliseGoodbye(data.goodbye) } : {}),
        ...(data.arrivals ? { checkin_welcome: normaliseArrivals(data.arrivals) } : {}),
      })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function propertyFor(shortCode: string) {
  const db = await admin();
  const { data: p, error } = await db
    .from("properties")
    .select(
      "id, timezone, default_check_in_time, default_check_out_time, checkout_goodbye, checkin_welcome",
    )
    .eq("short_code", shortCode.toLowerCase())
    .maybeSingle();
  return { db, p: error ? null : p };
}

export type GoodbyeCard = {
  /** "in": a guest arriving today; "out": a guest leaving today. */
  kind: "in" | "out";
  /** Leaving guests only: for Express check-out. */
  handle: string;
  firstName: string;
  room: string | null;
  message: string;
  /** Their check-in or check-out time ("15:00", or an early/late one). */
  until: string;
  /** Early check-in or late check-out booked. */
  late: boolean;
  /**
   * The host's own welcome, merged in: it replaces that guest's card (never
   * a second card) or adds one. Its Check in opens their stay as the host's
   * welcome does (startFromWelcome).
   */
  welcome?: { version: number; source: "device" | "all"; checkIn: boolean };
};

export type KioskCards = {
  cards: GoodbyeCard[];
  keyDrop: string;
  lockDoor: boolean;
  colours: { in: string; out: string };
  /** The version of the host's welcome now shown as a card (the full-screen welcome stays off). */
  mergedWelcome: number | null;
};

const liveMsg = (r: any) => !!r && !r.cleared_at && Date.parse(r.expires_at) > Date.now();

/**
 * The cards for one tablet (or every tablet, with no device): guests
 * arriving and leaving today by the host's timings, or straight away when
 * the host asked, with the host's own welcome merged in. Shared by the
 * tablet and the host's preview so they always agree.
 */
async function cardsFor(
  db: any,
  p: any,
  deviceId: string | null,
  forPreview = false,
): Promise<KioskCards> {
  const g = normaliseGoodbye(p.checkout_goodbye);
  const a = normaliseArrivals(p.checkin_welcome);
  const none: KioskCards = {
    cards: [],
    keyDrop: g.keyDrop,
    lockDoor: g.lockDoor,
    colours: { in: a.colour, out: g.colour },
    mergedWelcome: null,
  };
  const tz = p.timezone ?? "Europe/London";
  const today = todayInZone(tz);
  const standardOut = (p.default_check_out_time ?? "11:00").slice(0, 5);
  const standardIn = (p.default_check_in_time ?? "15:00").slice(0, 5);
  const { data: rows, error } = await db
    .from("bookings")
    .select(
      "id, status, check_in_date, check_out_date, check_in_time, check_out_time, guest_full_name, goodbye_dismissed_at, goodbye_now_at, welcome_card_dismissed_at, welcome_now_at, mirror_of, rooms(display_name, sort_order)",
    )
    .eq("property_id", p.id)
    .or(`check_out_date.eq.${today},check_in_date.eq.${today}`)
    .limit(400);
  if (error) return none;
  const now = Date.now();
  const all = (rows ?? []) as any[];
  const byRoom = (x: any, y: any) =>
    (x.rooms?.sort_order ?? 0) - (y.rooms?.sort_order ?? 0) ||
    String(x.rooms?.display_name ?? "").localeCompare(String(y.rooms?.display_name ?? ""));
  const arrivingRows = all
    .filter((b) => b.check_in_date === today && showsArrival(b, today, now, standardIn, tz, a))
    .sort(byRoom);
  const arriving: Array<GoodbyeCard & { bookingId: string }> = arrivingRows.map((b) => ({
    bookingId: b.id,
    kind: "in",
    handle: "",
    firstName: firstName(b.guest_full_name),
    room: b.rooms?.display_name ?? null,
    message: arrivalText(a, firstName(b.guest_full_name)),
    until: (b.check_in_time ?? standardIn).slice(0, 5),
    late: arrivalStart(b, standardIn, tz, a).early,
  }));
  const leaving = await Promise.all(
    all
      .filter(
        (b) => b.check_out_date === today && showsGoodbyeNow(b, today, now, standardOut, tz, g),
      )
      .sort(byRoom)
      .map(async (b): Promise<GoodbyeCard> => ({
        kind: "out",
        handle: forPreview ? "" : await handleFor(b.id, p.id),
        firstName: firstName(b.guest_full_name),
        room: b.rooms?.display_name ?? null,
        message: goodbyeText(g, firstName(b.guest_full_name)),
        until: (b.check_out_time ?? standardOut).slice(0, 5),
        late: goodbyeWindow(b, standardOut, tz, g).late,
      })),
  );
  if (!arriving.length && !leaving.length) return none;

  // The host's own welcome joins the cards: this tablet's own, else the one for all.
  const cols = "headline, body, version, cleared_at, expires_at, booking_id";
  let msg: any = null;
  let source: "device" | "all" = "all";
  if (deviceId) {
    const { data: own } = await db
      .from("kiosk_device_messages")
      .select(cols)
      .eq("device_id", deviceId)
      .maybeSingle();
    if (liveMsg(own)) {
      msg = own;
      source = "device";
    }
  }
  if (!msg) {
    const { data: allMsg } = await db
      .from("kiosk_messages")
      .select(cols)
      .eq("property_id", p.id)
      .maybeSingle();
    if (liveMsg(allMsg)) msg = allMsg;
  }
  let mergedWelcome: number | null = null;
  if (msg) {
    const b = msg.booking_id ? all.find((x) => x.id === msg.booking_id) : null;
    // Checked in already: its job is done, as on its own.
    if (!(b && b.status === "checked_in")) {
      const text = [msg.headline, msg.body].filter(Boolean).join(" ");
      const meta = {
        version: msg.version as number,
        source,
        // startFromWelcome checks the host's journey allows it.
        checkIn: !!b && b.status !== "cancelled",
      };
      const same = b ? arriving.find((c) => c.bookingId === b.id) : null;
      if (same) {
        // Their card already shows: it takes the host's words instead of a second card.
        same.message = text;
        same.welcome = meta;
      } else {
        arriving.unshift({
          bookingId: b?.id ?? "",
          kind: "in",
          handle: "",
          firstName: b ? firstName(b.guest_full_name) : "",
          room: b?.rooms?.display_name ?? null,
          message: text,
          until: (b?.check_in_time ?? standardIn).slice(0, 5),
          late: false,
          welcome: meta,
        });
      }
      mergedWelcome = msg.version as number;
    }
  }
  return {
    ...none,
    cards: [...arriving.map(({ bookingId: _b, ...c }) => c), ...leaving],
    mergedWelcome,
  };
}

/** The door tablet's cards now (its own welcome included when it's a paired tablet). */
export const kioskGoodbyes = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ code, device: z.string().min(24).max(80).optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<KioskCards> => {
    const { db, p } = await propertyFor(data.code);
    if (!p)
      return {
        cards: [],
        keyDrop: "",
        lockDoor: false,
        colours: { in: "#F6E2A8", out: "#CFE3EC" },
        mergedWelcome: null,
      };
    let deviceId: string | null = null;
    if (data.device) {
      const { sha256 } = await import("./checkin.server");
      const { data: dev } = await db
        .from("kiosk_devices")
        .select("id, status")
        .eq("token_hash", sha256(data.device))
        .eq("property_id", p.id)
        .maybeSingle();
      if (dev && dev.status !== "pending") deviceId = dev.id;
    }
    return cardsFor(db, p, deviceId);
  });

/**
 * The host's preview: what each tablet shows now, screen by screen. With
 * no tablets, one preview for "every tablet". Also says whether a
 * full-screen welcome shows instead (when there are no cards).
 */
export const previewKioskScreens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: own } = await sb
      .from("properties")
      .select("short_code")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!own) throw new Error("Property not found.");
    const { db, p } = await propertyFor(own.short_code);
    if (!p) throw new Error("Property not found.");
    const { data: devs } = await db
      .from("kiosk_devices")
      .select("id, number, label, status, display")
      .eq("property_id", p.id)
      .eq("status", "confirmed")
      .order("number", { ascending: true })
      .limit(20);
    const tablets = ((devs ?? []) as any[]).map((d) => ({
      id: d.id as string | null,
      number: d.number as number | null,
      label: (d.label as string | null) ?? null,
      w: (d.display?.usedW || d.display?.w || 1280) as number,
      h: (d.display?.usedH || d.display?.h || 800) as number,
    }));
    const list = tablets.length
      ? tablets
      : [{ id: null, number: null, label: null, w: 1280, h: 800 }];
    // The full-screen welcome (when no cards): its words, for the preview.
    const welcomeFor = async (deviceId: string | null) => {
      const cols = "headline, body, cleared_at, expires_at";
      if (deviceId) {
        const { data: m } = await db
          .from("kiosk_device_messages")
          .select(cols)
          .eq("device_id", deviceId)
          .maybeSingle();
        if (liveMsg(m)) return { headline: m.headline as string, body: (m.body as string) ?? null };
      }
      const { data: m } = await db
        .from("kiosk_messages")
        .select(cols)
        .eq("property_id", p.id)
        .maybeSingle();
      return liveMsg(m)
        ? { headline: m.headline as string, body: (m.body as string) ?? null }
        : null;
    };
    return {
      tablets: await Promise.all(
        list.map(async (t) => {
          const cards = await cardsFor(db, p, t.id, true);
          return {
            ...t,
            cards,
            welcome: cards.cards.length ? null : await welcomeFor(t.id),
          };
        }),
      ),
    };
  });

/** Marks the stay checked out and takes its goodbye off the tablet. */
async function checkOut(db: any, bookingId: string, source: string) {
  const now = new Date().toISOString();
  await db
    .from("bookings")
    .update({ status: "checked_out", checked_out_at: now, goodbye_dismissed_at: now })
    .eq("id", bookingId)
    .in("status", ["checked_in", "upcoming", "flagged", "needs_details"]);
  await db.from("presence_log").insert({ booking_id: bookingId, event: "checked_out", source });
}

/**
 * Express check-out on the door tablet: the guest says they're leaving. The
 * tablet then reminds them of the keys, the door and a review (with their
 * guide's short link for it), and goes back to its usual screen after 10 minutes.
 */
export const kioskExpressCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code, handle: z.string().max(300) }).parse(d))
  .handler(async ({ data }) => {
    const { db, p } = await propertyFor(data.code);
    if (!p) throw new Error("We couldn't do that. Please tell your host you've left.");
    const id = await readHandle(data.handle, p.id);
    if (!id) throw new Error("We couldn't do that. Please tell your host you've left.");
    const { data: b } = await db
      .from("bookings")
      .select("id, guest_full_name, check_out_date, check_out_time")
      .eq("id", id)
      .eq("property_id", p.id)
      .maybeSingle();
    if (!b) throw new Error("We couldn't do that. Please tell your host you've left.");
    await checkOut(db, b.id, "express_checkout");
    // Their guide's short link, for the review (it works until their check-out time).
    const { guideWindow } = await import("./guide");
    const tz = p.timezone ?? "Europe/London";
    const win = guideWindow(
      b.check_out_date,
      b.check_out_date,
      (b.check_out_time ?? p.default_check_out_time ?? "11:00").slice(0, 5),
      tz,
    );
    const { shortLinkFor } = await import("./stay-links.server");
    const short = await shortLinkFor(b.id, win.expiresAt).catch(() => null);
    const g = normaliseGoodbye(p.checkout_goodbye);
    return {
      firstName: firstName(b.guest_full_name),
      keyDrop: g.keyDrop,
      lockDoor: g.lockDoor,
      reviewCode: short,
    };
  });

/** "I've checked out" in the guest's own guide. */
export const guideCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { sha256 } = await import("./checkin.server");
    const { data: t } = await db
      .from("stay_tokens")
      .select("booking_id, expires_at")
      .eq("token_hash", sha256(data.token))
      .maybeSingle();
    if (!t || Date.parse(t.expires_at) < Date.now()) throw new Error("This link has ended.");
    await checkOut(db, t.booking_id, "guest_guide");
    return { ok: true };
  });

/**
 * Today: the host shows a guest's check-in or check-out card on the tablet
 * now (whatever the time), or takes it off. Returns the code to ping.
 */
export const setKioskCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bookingId: uuid, kind: z.enum(["in", "out"]), show: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: b } = await db
      .from("bookings")
      .select("id, property_id, properties(host_id, short_code)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b?.properties) throw new Error("We couldn't find that stay.");
    await requireWrite(context.supabase, b.properties.host_id);
    const now = new Date().toISOString();
    const patch =
      data.kind === "in"
        ? data.show
          ? { welcome_now_at: now, welcome_card_dismissed_at: null }
          : { welcome_card_dismissed_at: now, welcome_now_at: null }
        : data.show
          ? { goodbye_now_at: now, goodbye_dismissed_at: null }
          : { goodbye_dismissed_at: now, goodbye_now_at: null };
    const { error } = await db.from("bookings").update(patch).eq("id", b.id);
    if (error)
      throw new Error(
        /now_at|card_dismissed/.test(error.message)
          ? "Showing cards from Today needs the latest update (migration 0070)."
          : error.message,
      );
    return { code: b.properties.short_code as string };
  });

/** Today: each arriving and leaving guest's card, and whether it's on the tablet now. */
export const todayKioskCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: p, error: pe } = await sb
      .from("properties")
      .select(
        "timezone, default_check_in_time, default_check_out_time, checkout_goodbye, checkin_welcome",
      )
      .eq("id", data.propertyId)
      .maybeSingle();
    type CardGuest = { id: string; name: string | null; kind: "in" | "out"; state: string };
    if (pe || !p)
      return {
        available: false as const,
        states: {} as Record<string, string>,
        guests: [] as CardGuest[],
      };
    const tz = p.timezone ?? "Europe/London";
    const today = todayInZone(tz);
    const { data: rows, error } = await sb
      .from("bookings")
      .select(
        "id, guest_full_name, status, check_in_date, check_out_date, check_in_time, check_out_time, goodbye_dismissed_at, goodbye_now_at, welcome_card_dismissed_at, welcome_now_at, mirror_of",
      )
      .eq("property_id", data.propertyId)
      .is("mirror_of", null)
      .neq("status", "cancelled")
      .or(`check_out_date.eq.${today},check_in_date.eq.${today}`)
      .limit(400);
    if (error)
      return {
        available: false as const,
        states: {} as Record<string, string>,
        guests: [] as CardGuest[],
      };
    const now = Date.now();
    const g = normaliseGoodbye(p.checkout_goodbye);
    const a = normaliseArrivals(p.checkin_welcome);
    const states: Record<string, string> = {};
    for (const b of (rows ?? []) as any[]) {
      if (b.check_in_date === today)
        states[`in:${b.id}`] =
          b.status === "checked_in"
            ? "done"
            : b.welcome_card_dismissed_at
              ? "off"
              : showsArrival(b, today, now, (p.default_check_in_time ?? "15:00").slice(0, 5), tz, a)
                ? "showing"
                : "later";
      if (b.check_out_date === today)
        states[`out:${b.id}`] =
          b.status === "checked_out"
            ? "done"
            : b.goodbye_dismissed_at
              ? "off"
              : showsGoodbyeNow(
                    b,
                    today,
                    now,
                    (p.default_check_out_time ?? "11:00").slice(0, 5),
                    tz,
                    g,
                  )
                ? "showing"
                : "later";
    }
    const guests: CardGuest[] = [];
    for (const b of (rows ?? []) as any[])
      for (const kind of ["in", "out"] as const)
        if (states[`${kind}:${b.id}`])
          guests.push({
            id: b.id,
            name: b.guest_full_name ?? null,
            kind,
            state: states[`${kind}:${b.id}`]!,
          });
    return { available: true as const, states, guests };
  });
