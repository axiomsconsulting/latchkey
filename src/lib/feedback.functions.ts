/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Feedback. Hosts rate Latchkey, suggest features and report bugs, all of
 * which go to the super admin. Guests rate their stay from the guest guide,
 * which goes to their host.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

type Loose = { from: (t: string) => any };
const loose = (c: unknown) => c as Loose;

/** From a host: a star rating, a feature idea or a bug report. */
export const sendFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["host_rating", "feature", "bug"]),
        rating: z.number().int().min(1).max(5).nullable(),
        message: z.string().trim().max(2000),
        hostId: uuid.nullable(),
        page: z.string().max(300).nullable(),
      })
      .refine((v) => v.rating !== null || v.message.length > 0, "Add a rating or a few words.")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await loose(context.supabase)
      .from("feedback")
      .insert({
        kind: data.kind,
        rating: data.kind === "host_rating" ? data.rating : null,
        message: data.message || null,
        host_id: data.hostId,
        user_id: context.userId,
        page: data.page,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** The stay behind a guest guide link, if it's open. */
async function stayFromGuideToken(t: string) {
  const { sha256, admin } = await import("./checkin.server");
  const db = await admin();
  const { data } = await db
    .from("stay_tokens")
    .select("booking_id, expires_at, valid_from")
    .eq("token_hash", sha256(t))
    .maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) return null;
  if (data.valid_from && Date.parse(data.valid_from) > Date.now()) return null;
  const { data: b } = await db
    .from("bookings")
    .select("id, property_id, channel, guest_full_name, properties(host_id)")
    .eq("id", data.booking_id)
    .maybeSingle();
  const hostId = (b as { properties?: { host_id: string } | null } | null)?.properties?.host_id;
  return b && hostId
    ? {
        bookingId: b.id,
        propertyId: b.property_id,
        hostId,
        db,
        direct: b.channel === "direct",
        firstName: (b.guest_full_name ?? "").trim().split(/\s+/)[0]?.slice(0, 40) || null,
      }
    : null;
}

/** Has this guest already rated their stay? */
export const getGuestReview = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(20).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const stay = await stayFromGuideToken(data.token);
    if (!stay) return { open: false as const };
    const { withLegacy } = await import("./checkin.server");
    const pick = (cols: string) =>
      loose(stay.db)
        .from("feedback")
        .select(cols)
        .eq("booking_id", stay.bookingId)
        .eq("kind", "guest_review")
        .maybeSingle();
    // The score out of 10 comes with migration 0058.
    const { data: done } = await withLegacy<any>(
      () => pick("rating, score"),
      () => pick("rating"),
    );
    const row = done as { rating: number | null; score?: number | null } | null;
    return {
      open: true as const,
      rating: row?.rating ?? null,
      score: row?.score ?? null,
      sent: !!row,
      direct: stay.direct,
    };
  });

/** A guest's stars and comment, for their host. One per stay. */
export const sendGuestReview = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(20).max(80),
        rating: z.number().int().min(1).max(5).optional(),
        /** Direct stays: a score out of 10 instead of stars. */
        score: z.number().int().min(1).max(10).optional(),
        /** The guest agrees to it being shown, with their first name, on the property's booking page. */
        publicOk: z.boolean().optional(),
        message: z.string().trim().max(2000),
      })
      .refine((v) => v.rating !== undefined || v.score !== undefined, "Choose a score.")
      .parse(d),
  )
  .handler(async ({ data }) => {
    const stay = await stayFromGuideToken(data.token);
    if (!stay) throw new Error("This guest guide link has expired.");
    const db = loose(stay.db);
    const { data: done } = await db
      .from("feedback")
      .select("id")
      .eq("booking_id", stay.bookingId)
      .eq("kind", "guest_review")
      .maybeSingle();
    if (done) return { ok: true };
    const { starsOf } = await import("./stay-access");
    const row = {
      kind: "guest_review",
      rating: data.score !== undefined ? starsOf(data.score) : data.rating!,
      message: data.message || null,
      host_id: stay.hostId,
      property_id: stay.propertyId,
      booking_id: stay.bookingId,
    };
    const { withLegacy } = await import("./checkin.server");
    // Scores and agreeing to be shown come with migration 0058; before it, the stars still arrive.
    const { error } = await withLegacy<any>(
      () =>
        db.from("feedback").insert({
          ...row,
          ...(data.score !== undefined ? { score: data.score } : {}),
          public_ok: stay.direct && data.publicOk === true,
          display_name: stay.direct && data.publicOk ? stay.firstName : null,
        }),
      () => db.from("feedback").insert(row),
    );
    if (error) throw new Error("We couldn't send that. Please try again.");
    return { ok: true };
  });

/** For hosts: what guests said, newest first. */
export const listGuestReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await loose(context.supabase)
      .from("feedback")
      .select("*, bookings(guest_full_name, channel), properties(name)")
      .eq("host_id", data.hostId)
      .eq("kind", "guest_review")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return [];
    return (rows ?? []) as Array<{
      id: string;
      rating: number | null;
      message: string | null;
      created_at: string;
      booking_id: string | null;
      /** Since migration 0058. */
      score?: number | null;
      public_ok?: boolean;
      host_hidden?: boolean;
      bookings: { guest_full_name: string | null; channel?: string } | null;
      properties: { name: string } | null;
    }>;
  });

/** The host keeps a review off (or back on) their booking page. */
export const setReviewShown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, shown: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: f } = await loose(context.supabase)
      .from("feedback")
      .select("id, host_id")
      .eq("id", data.id)
      .eq("kind", "guest_review")
      .maybeSingle();
    if (!f) throw new Error("Review not found.");
    const { requireWrite } = await import("./roles");
    await requireWrite(context.supabase, (f as { host_id: string }).host_id);
    const { admin } = await import("./checkin.server");
    const { error } = await loose(await admin())
      .from("feedback")
      .update({ host_hidden: !data.shown })
      .eq("id", data.id);
    if (error)
      throw new Error(
        /host_hidden/.test(error.message)
          ? "This needs the latest database update (migration 0058)."
          : error.message,
      );
    return { ok: true };
  });
