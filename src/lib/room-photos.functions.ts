/* eslint-disable @typescript-eslint/no-explicit-any -- room_photos is from migration 0082, newer than the generated types */
/**
 * Room photos for the booking page (room-photos.ts): hosts add them per room
 * (or for the property's shared spaces), pick each one's space, put them in
 * order, and can have AI sort them by space: with the "ai_photos" plan
 * feature, or as a trial on AI_PHOTO_TRIAL_ROOMS rooms. Every AI run is
 * behind the "ai_photos" routine and counted (usage.server.ts). Files live
 * in the "branding" bucket with long-lived links, like room cover photos.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";
import {
  AI_PHOTO_TRIAL_ROOMS,
  MAX_PHOTOS_PER_ROOM,
  SPACES,
  aiPhotoAccess,
  normaliseSpace,
  type RoomPhoto,
} from "./room-photos";

const uuid = z.string().uuid();
const space = z.enum(SPACES);
type Loose = { from: (t: string) => any; storage?: any };

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const toPhoto = (r: any): RoomPhoto => ({
  id: r.id,
  roomId: r.room_id ?? null,
  space: normaliseSpace(r.space),
  caption: r.caption ?? null,
  url: r.url,
  position: r.position ?? 0,
});

/** The business has AI photo sorting in its plan (or is complimentary). */
async function hasAiPhotos(db: any, hostId: string): Promise<boolean> {
  const [{ data: host }, { data: site }] = await Promise.all([
    db.from("hosts").select("plan_key, subscription_status").eq("id", hostId).maybeSingle(),
    db.from("site_settings").select("pricing_model").eq("id", 1).maybeSingle(),
  ]);
  if (host?.subscription_status === "comped") return true;
  if (!site?.pricing_model) return false;
  const { normaliseModel, planFor } = await import("./pricing-model");
  return planFor(normaliseModel(site.pricing_model), host?.plan_key).features.includes("ai_photos");
}

async function aiState(db: any, hostId: string) {
  const [feature, { data: tried }] = await Promise.all([
    hasAiPhotos(db, hostId),
    db
      .from("ai_feature_trials")
      .select("subject_id")
      .eq("host_id", hostId)
      .eq("feature", "ai_photos"),
  ]);
  return {
    hasFeature: feature,
    tried: ((tried ?? []) as Array<{ subject_id: string }>).map((t) => t.subject_id),
  };
}

export const listRoomPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    const [{ data: rooms }, photos] = await Promise.all([
      sb
        .from("rooms")
        .select("id, display_name, public_title, cover_image_url, sort_order")
        .eq("property_id", data.propertyId)
        .neq("active", false)
        .order("sort_order"),
      sb
        .from("room_photos")
        .select("id, room_id, space, caption, url, position")
        .eq("property_id", data.propertyId)
        .order("position"),
    ]);
    const db = await admin();
    const ai = await aiState(db, hostId);
    const { jobAllowed } = await import("./usage.server");
    return {
      available: !photos.error,
      rooms: ((rooms ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: (r.public_title as string | null) || (r.display_name as string),
        cover: (r.cover_image_url as string | null) ?? null,
      })),
      photos: ((photos.data ?? []) as any[]).map(toPhoto),
      ai: {
        on: await jobAllowed("ai_photos"),
        hasFeature: ai.hasFeature,
        tried: ai.tried,
        trialRooms: AI_PHOTO_TRIAL_ROOMS,
      },
    };
  });

/** Adds photos (a few at a time) to a room, or to the property's shared spaces. */
export const addRoomPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        roomId: uuid.nullable(),
        space,
        photos: z
          .array(
            z
              .string()
              .max(7_000_000)
              .regex(/^data:image\/(jpeg|png|webp);base64,/),
          )
          .min(1)
          .max(6),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const db = await admin();
    if (data.roomId) {
      const { data: room } = await db
        .from("rooms")
        .select("property_id")
        .eq("id", data.roomId)
        .maybeSingle();
      if (room?.property_id !== data.propertyId) throw new Error("Room not found.");
    }
    const base = db.from("room_photos").select("id, position").eq("property_id", data.propertyId);
    const { data: existing } = await (data.roomId
      ? base.eq("room_id", data.roomId)
      : base.is("room_id", null));
    const have = (existing ?? []) as Array<{ position: number }>;
    if (have.length + data.photos.length > MAX_PHOTOS_PER_ROOM)
      throw new Error(`Up to ${MAX_PHOTOS_PER_ROOM} photos each. Remove some first.`);
    let next = have.reduce((m, p) => Math.max(m, p.position), -1) + 1;
    const added: RoomPhoto[] = [];
    for (const url of data.photos) {
      const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(url)!;
      const bytes = Buffer.from(m[2]!, "base64");
      if (bytes.length > 5 * 1024 * 1024) throw new Error("Photos must be under 5 MB.");
      const path = `${data.propertyId}/gallery/${crypto.randomUUID()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
      const up = await db.storage
        .from("branding")
        .upload(path, bytes, { contentType: `image/${m[1]}`, upsert: false });
      if (up.error) throw new Error(up.error.message);
      const signed = await db.storage
        .from("branding")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signed.error) throw new Error(signed.error.message);
      const { data: row, error } = await db
        .from("room_photos")
        .insert({
          host_id: hostId,
          property_id: data.propertyId,
          room_id: data.roomId,
          space: data.space,
          path,
          url: signed.data.signedUrl,
          position: next++,
        })
        .select("id, room_id, space, caption, url, position")
        .single();
      if (error || !row) {
        await db.storage.from("branding").remove([path]);
        throw new Error(
          /room_photos/.test(error?.message ?? "")
            ? "Room photos need the latest update (migration 0082)."
            : (error?.message ?? "The photo couldn't be saved."),
        );
      }
      added.push(toPhoto(row));
    }
    return { added };
  });

async function photoHost(context: any, id: string) {
  const db = await admin();
  const { data: p } = await db
    .from("room_photos")
    .select("id, host_id, property_id, room_id, path")
    .eq("id", id)
    .maybeSingle();
  if (!p) throw new Error("Photo not found.");
  await requireWrite(context.supabase, p.host_id);
  return { db, p };
}

/** A photo's space, caption, or which room it belongs to. */
export const updateRoomPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        space: space.optional(),
        caption: z.string().trim().max(140).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await photoHost(context, data.id);
    const patch: Record<string, unknown> = {};
    if (data.space) patch["space"] = data.space;
    if (data.caption !== undefined) patch["caption"] = data.caption || null;
    await db.from("room_photos").update(patch).eq("id", data.id);
    return { ok: true };
  });

/** The order the host dragged them into. */
export const orderRoomPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(uuid).min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, p } = await photoHost(context, data.ids[0]!);
    const { data: rows } = await db.from("room_photos").select("id, host_id").in("id", data.ids);
    if (((rows ?? []) as any[]).some((r) => r.host_id !== p.host_id))
      throw new Error("Photo not found.");
    await Promise.all(
      data.ids.map((id, i) => db.from("room_photos").update({ position: i }).eq("id", id)),
    );
    return { ok: true };
  });

export const removeRoomPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, p } = await photoHost(context, data.id);
    await db.from("room_photos").delete().eq("id", data.id);
    await db.storage
      .from("branding")
      .remove([p.path])
      .catch(() => undefined);
    return { ok: true };
  });

const SORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["photos"],
  properties: {
    photos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "space", "caption"],
        properties: {
          index: { type: "integer" },
          space: { type: "string", enum: [...SPACES] },
          caption: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/**
 * AI sorts one room's photos (or the shared spaces') into spaces, with a
 * short caption where it helps. Captions the host wrote are kept.
 */
export const sortRoomPhotosAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, roomId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const { jobAllowed, bumpUsage } = await import("./usage.server");
    if (!(await jobAllowed("ai_photos")))
      throw new Error("AI photo sorting is switched off for now. Pick each photo's space instead.");
    const db = await admin();
    const subject = data.roomId ?? data.propertyId;
    const state = await aiState(db, hostId);
    const access = aiPhotoAccess({
      hasFeature: state.hasFeature,
      triedRooms: state.tried,
      roomKey: subject,
    });
    if (!access.allowed)
      throw new Error(
        state.tried.includes(subject)
          ? "This room has had its free AI sort. AI photo sorting for every room comes with plans that include it."
          : `The free trial covers ${AI_PHOTO_TRIAL_ROOMS} rooms. AI photo sorting for every room comes with plans that include it.`,
      );
    const base = db
      .from("room_photos")
      .select("id, url, caption")
      .eq("property_id", data.propertyId)
      .order("position");
    const { data: rows } = await (data.roomId
      ? base.eq("room_id", data.roomId)
      : base.is("room_id", null));
    const list = (rows ?? []) as Array<{ id: string; url: string; caption: string | null }>;
    if (!list.length) throw new Error("Add some photos first.");

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI isn't set up for Latchkey yet.");
    // The trial is used once the request is sent, whatever comes back.
    if (access.trial)
      await db
        .from("ai_feature_trials")
        .upsert({ host_id: hostId, feature: "ai_photos", subject_id: subject });
    const { createLovableAiGatewayRunIdFetch } = await import("./ai-run-id.server");
    const res = await createLovableAiGatewayRunIdFetch().fetch(
      "https://ai.gateway.lovable.dev/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          stream: true,
          store: false,
          reasoning: { effort: "low", summary: "auto" },
          include: ["reasoning.encrypted_content"],
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text:
                    `These are ${list.length} photos of ${data.roomId ? "one guest room and its bathroom" : "the shared spaces of a guest house"}, numbered from 0 in order. ` +
                    `For each, give its index, the space it shows (one of: ${SPACES.join(", ")}) and a short plain caption a guest would find useful ` +
                    "(at most 8 words, no marketing words, nothing you can't see), or null. Return every photo once.",
                },
                ...list.map((p) => ({ type: "input_image", image_url: p.url })),
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "photo_spaces",
              strict: true,
              schema: SORT_SCHEMA,
            },
          },
        }),
      },
    );
    if (!res.ok || !res.body) {
      if (res.status === 429)
        throw new Error("The AI service is busy. Please try again in a minute.");
      if (res.status === 402)
        throw new Error("Latchkey's AI credits have run out. Please try later.");
      throw new Error("AI photo sorting is unavailable right now.");
    }
    const { readAiStream } = await import("./ai-stream");
    const text = await readAiStream(res.body);
    await bumpUsage(hostId, "ai:photo_sort", list.length);
    let parsed: { photos?: Array<{ index: number; space: string; caption: string | null }> };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("The AI's answer couldn't be read. Please try again.");
    }
    let sorted = 0;
    for (const a of parsed.photos ?? []) {
      const p = list[a.index];
      if (!p) continue;
      await db
        .from("room_photos")
        .update({
          space: normaliseSpace(a.space),
          ai_sorted: true,
          ...(p.caption ? {} : { caption: a.caption?.trim().slice(0, 140) || null }),
        })
        .eq("id", p.id);
      sorted++;
    }
    return { sorted };
  });
