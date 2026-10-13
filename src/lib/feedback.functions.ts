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
  const { data: b } = await db.from("bookings").select("id, property_id, properties(host_id)").eq("id", data.booking_id).maybeSingle();
  const hostId = (b as { properties?: { host_id: string } | null } | null)?.properties?.host_id;
  return b && hostId ? { bookingId: b.id, propertyId: b.property_id, hostId, db } : null;
}

/** Has this guest already rated their stay? */
export const getGuestReview = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(20).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const stay = await stayFromGuideToken(data.token);
    if (!stay) return { open: false as const };
    const { data: done } = await loose(stay.db)
      .from("feedback")
      .select("rating")
      .eq("booking_id", stay.bookingId)
      .eq("kind", "guest_review")
      .maybeSingle();
    return { open: true as const, rating: (done as { rating: number | null } | null)?.rating ?? null, sent: !!done };
  });

/** A guest's stars and comment, for their host. One per stay. */
export const sendGuestReview = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({ token: z.string().min(20).max(80), rating: z.number().int().min(1).max(5), message: z.string().trim().max(2000) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const stay = await stayFromGuideToken(data.token);
    if (!stay) throw new Error("This guest guide link has expired.");
    const db = loose(stay.db);
    const { data: done } = await db.from("feedback").select("id").eq("booking_id", stay.bookingId).eq("kind", "guest_review").maybeSingle();
    if (done) return { ok: true };
    const { error } = await db.from("feedback").insert({
      kind: "guest_review",
      rating: data.rating,
      message: data.message || null,
      host_id: stay.hostId,
      property_id: stay.propertyId,
      booking_id: stay.bookingId,
    });
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
      .select("id, rating, message, created_at, booking_id, bookings(guest_full_name), properties(name)")
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
      bookings: { guest_full_name: string | null } | null;
      properties: { name: string } | null;
    }>;
  });
