/* eslint-disable @typescript-eslint/no-explicit-any -- columns and tables from migration 0109 */
/**
 * The guest guide's extra cards (guest side) and their editors (host side): property
 * information, around here and floor plans. Rules in property-info.ts, local-guide.ts and
 * floor-plans.ts; reads in guest-extras.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";
import { secret } from "@/lib/secrets";

const uuid = z.string().uuid();
const dataUrl = z
  .string()
  .max(8_000_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,/);

async function srv() {
  return import("./guest-extras.server");
}

/** A stay's property and room from its guide link (null when the link is wrong or over). */
async function stayOf(token: string) {
  const { sha256 } = await import("./checkin.server");
  const sb = await (await srv()).db();
  const { data: t } = await sb
    .from("stay_tokens")
    .select("booking_id, expires_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!t || Date.parse(t.expires_at) < Date.now()) return null;
  const { data: b } = await sb
    .from("bookings")
    .select("property_id, room_id, rooms(display_name, public_title)")
    .eq("id", t.booking_id)
    .maybeSingle();
  if (!b) return null;
  return {
    propertyId: b.property_id as string,
    room: b.room_id
      ? {
          id: b.room_id as string,
          name:
            (b.rooms?.public_title as string | null) ||
            (b.rooms?.display_name as string) ||
            "Your room",
        }
      : null,
  };
}

/* --------------------------------- guests --------------------------------- */

export const getStayExtras = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const stay = await stayOf(data.token);
    if (!stay) return null;
    return (await srv()).extrasFor(stay.propertyId, stay.room);
  });

export const getRoomExtras = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: z.string().min(3).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { roomByCode } = await import("./room-code.server");
    const sb = await (await srv()).db();
    const room = await roomByCode<{ property_id: string }>(sb, data.code, "id, property_id");
    if (!room) return null;
    // In the room already: no way to it, just the information and the area.
    return (await srv()).extrasFor(room.property_id, null);
  });

/* ------------------------------ host: information ------------------------------ */

async function write(context: any, propertyId: string) {
  const hostId = await hostOfProperty(context.supabase, propertyId);
  await requireWrite(context.supabase, hostId);
  return hostId;
}

export const getPropertyInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: p, error } = await sb
      .from("properties")
      .select("property_info")
      .eq("id", data.propertyId)
      .maybeSingle();
    const { normalisePropertyInfo } = await import("./property-info");
    const items = normalisePropertyInfo(p?.property_info, data.propertyId);
    return {
      available: !error,
      items,
      previews: await (
        await srv()
      ).signed(
        items.flatMap((i) => i.images),
        5 * 60,
      ),
    };
  });

export const savePropertyInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ propertyId: uuid, items: z.array(z.record(z.string(), z.unknown())).max(40) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await write(context, data.propertyId);
    const { normalisePropertyInfo } = await import("./property-info");
    const items = normalisePropertyInfo(data.items, data.propertyId);
    const sb = context.supabase as any;
    const { data: before } = await sb
      .from("properties")
      .select("property_info")
      .eq("id", data.propertyId)
      .maybeSingle();
    const { error } = await sb
      .from("properties")
      .update({ property_info: items })
      .eq("id", data.propertyId);
    if (error)
      throw new Error(
        /property_info/.test(error.message)
          ? "This needs the latest update (migration 0109)."
          : error.message,
      );
    // Photos no longer used are deleted.
    const keep = new Set(items.flatMap((i) => i.images));
    const gone = normalisePropertyInfo(before?.property_info, data.propertyId)
      .flatMap((i) => i.images)
      .filter((x) => !keep.has(x));
    if (gone.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("guides").remove(gone);
    }
    return { ok: true, items };
  });

/** A photo for an information item: kept in the private "guides" bucket; the item saves its path. */
export const uploadInfoImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, dataUrl }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await write(context, data.propertyId);
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(data.dataUrl)!;
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > 5 * 1024 * 1024) throw new Error("Photos must be under 5 MB.");
    const { randomBytes } = await import("node:crypto");
    const path = `${data.propertyId}/info/${randomBytes(8).toString("hex")}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage
      .from("guides")
      .upload(path, bytes, { contentType: `image/${m[1]}` });
    if (up.error) throw new Error(up.error.message);
    const url = (await (await srv()).signed([path], 5 * 60))[path] ?? null;
    return { path, url };
  });

/* ------------------------------ host: around here ------------------------------ */

export const getLocalGuideSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: p, error } = await sb
      .from("properties")
      .select("local_guide, timezone")
      .eq("id", data.propertyId)
      .maybeSingle();
    const { normaliseLocalGuide } = await import("./local-guide");
    const admin = await (await srv()).db();
    const { data: row } = await admin
      .from("local_places")
      .select("places, events, fetched_at, error, lat, lng")
      .eq("property_id", data.propertyId)
      .maybeSingle();
    return {
      available: !error,
      settings: normaliseLocalGuide(p?.local_guide),
      places: ((row?.places ?? []) as any[]).slice(0, 80),
      events: ((row?.events ?? []) as any[]).slice(0, 30),
      fetchedAt: (row?.fetched_at as string | null) ?? null,
      noLocation: row?.error === "no_location",
      eventsAvailable:
        !!(secret("TICKETMASTER_API_KEY") ?? "").trim() ||
        !!(secret("SKIDDLE_API_KEY") ?? "").trim(),
    };
  });

export const saveLocalGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, settings: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await write(context, data.propertyId);
    const { normaliseLocalGuide } = await import("./local-guide");
    const settings = normaliseLocalGuide(data.settings);
    const { error } = await (context.supabase as any)
      .from("properties")
      .update({ local_guide: settings })
      .eq("id", data.propertyId);
    if (error)
      throw new Error(
        /local_guide/.test(error.message)
          ? "This needs the latest update (migration 0109)."
          : error.message,
      );
    return { ok: true, settings };
  });

export const refreshLocalGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await write(context, data.propertyId);
    return (await srv()).refreshPlaces(data.propertyId);
  });

/* ------------------------------ host: floor plans ------------------------------ */

export const getFloorPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rooms } = await sb
      .from("rooms")
      .select("id, display_name")
      .eq("property_id", data.propertyId)
      .neq("active", false)
      .order("sort_order");
    const { error } = await sb.from("floor_plans").select("id").limit(1);
    const plans = await (await srv()).plansFor(sb, data.propertyId);
    const urls = await (
      await srv()
    ).signed(
      plans.map((p) => p.imagePath),
      30 * 60,
    );
    return {
      available: !error,
      rooms: ((rooms ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: r.display_name as string,
      })),
      plans: plans.map((p) => ({ ...p, url: urls[p.imagePath] ?? null })),
    };
  });

/** Adds a floor (with its picture) or changes one's level, name or picture. */
export const saveFloorPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        id: uuid.nullable(),
        level: z.number().int().min(-3).max(30),
        label: z.string().max(60).nullable(),
        dataUrl: dataUrl.nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await write(context, data.propertyId);
    const sb = await (await srv()).db();
    let path: string | null = null;
    if (data.dataUrl) {
      const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(data.dataUrl)!;
      const bytes = Buffer.from(m[2]!, "base64");
      if (bytes.length > 6 * 1024 * 1024) throw new Error("Plans must be under 6 MB.");
      const { randomBytes } = await import("node:crypto");
      path = `${data.propertyId}/plans/${randomBytes(8).toString("hex")}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const up = await supabaseAdmin.storage
        .from("guides")
        .upload(path, bytes, { contentType: `image/${m[1]}` });
      if (up.error) throw new Error(up.error.message);
    }
    const label = data.label?.trim() || null;
    if (data.id) {
      const { data: old } = await sb
        .from("floor_plans")
        .select("id, image_path, property_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!old || old.property_id !== data.propertyId) throw new Error("Floor plan not found.");
      const { error } = await sb
        .from("floor_plans")
        .update({
          level: data.level,
          label,
          ...(path ? { image_path: path } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      if (path) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from("guides").remove([old.image_path]);
      }
      return { id: data.id };
    }
    if (!path) throw new Error("Choose a picture of the floor plan.");
    const { data: row, error } = await sb
      .from("floor_plans")
      .insert({ property_id: data.propertyId, level: data.level, label, image_path: path })
      .select("id")
      .single();
    if (error)
      throw new Error(
        /floor_plans/.test(error.message)
          ? "This needs the latest update (migration 0109)."
          : error.message,
      );
    return { id: row.id as string };
  });

export const saveFloorPins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, id: uuid, pins: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await write(context, data.propertyId);
    const { normalisePins } = await import("./floor-plans");
    const sb = await (await srv()).db();
    const pins = normalisePins(data.pins);
    // One entrance per building (the main house, or an annex): marking it here takes it off the
    // building's other floors. A room is on one floor only, as a pin or as an area.
    const plans = await (await srv()).plansFor(sb, data.propertyId);
    const here = pins.building ?? "";
    const mine = new Set((pins.areas ?? []).map((a) => a.roomId).filter(Boolean));
    for (const p of plans) {
      if (p.id === data.id) continue;
      let next = p.pins;
      if (pins.entrance && next.entrance && (next.building ?? "") === here) {
        const { entrance: _e, ...rest } = next;
        next = rest;
      }
      const clash = Object.keys(next.rooms).filter((r) => pins.rooms[r] || mine.has(r));
      if (clash.length) {
        const rooms = { ...next.rooms };
        for (const r of clash) delete rooms[r];
        next = { ...next, rooms };
      }
      if (next.areas?.some((a) => a.roomId && (mine.has(a.roomId) || pins.rooms[a.roomId])))
        next = {
          ...next,
          areas: next.areas.map((a) =>
            a.roomId && (mine.has(a.roomId) || pins.rooms[a.roomId]) ? { ...a, roomId: null } : a,
          ),
        };
      if (next !== p.pins) await sb.from("floor_plans").update({ pins: next }).eq("id", p.id);
    }
    const { error } = await sb
      .from("floor_plans")
      .update({ pins, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true, pins };
  });

export const deleteFloorPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await write(context, data.propertyId);
    const sb = await (await srv()).db();
    const { data: old } = await sb
      .from("floor_plans")
      .select("image_path, property_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!old || old.property_id !== data.propertyId) throw new Error("Floor plan not found.");
    await sb.from("floor_plans").delete().eq("id", data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("guides").remove([old.image_path]);
    return { ok: true };
  });

/** Reads the floor's plan picture with AI and proposes marks (areas, doors, stairs, entrance) for the host to check. */
const planReads = new Map<string, number[]>();
export const readFloorPlanMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await write(context, data.propertyId);
    const { jobAllowed, bumpUsage } = await import("./usage.server");
    if (!(await jobAllowed("ai_floor_plans")))
      throw new Error(
        "Reading plans automatically is switched off just now: draw the areas yourself.",
      );
    // A few reads a property an hour (each costs Latchkey a model call).
    const now = Date.now();
    const recent = (planReads.get(data.propertyId) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= 6)
      throw new Error("That's enough readings for now: try again in an hour.");
    planReads.set(data.propertyId, [...recent, now]);
    const sb = await (await srv()).db();
    const { data: plan } = await sb
      .from("floor_plans")
      .select("id, property_id, level, image_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!plan || plan.property_id !== data.propertyId) throw new Error("Floor plan not found.");
    const { data: rooms } = await sb
      .from("rooms")
      .select("id, display_name, public_title")
      .eq("property_id", data.propertyId)
      .neq("active", false);
    const { readPlanPicture } = await import("./floor-map-ai.server");
    const read = await readPlanPicture(
      plan.image_path,
      plan.level,
      ((rooms ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: (r.public_title || r.display_name) as string,
      })),
    );
    await bumpUsage(hostId, "ai:floor_plan");
    if (!read) throw new Error("That picture doesn't look like a floor plan Latchkey can read.");
    return read;
  });
