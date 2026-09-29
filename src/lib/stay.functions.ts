/**
 * Guest stay-page services. No sign-in: the private stay token is the key,
 * checked on every call. Guests only ever see their own requests.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { categoryById } from "./services";

const token = z.string().min(20).max(80);

async function stayBooking(t: string) {
  const { admin, sha256 } = await import("./checkin.server");
  const db = await admin();
  const { data: st } = await db.from("stay_tokens").select("booking_id, expires_at").eq("token_hash", sha256(t)).maybeSingle();
  if (!st || Date.parse(st.expires_at) < Date.now()) throw new Error("This stay link has expired.");
  const { data: b } = await db
    .from("bookings")
    .select("id, property_id, room_id, status, properties(host_id, timezone)")
    .eq("id", st.booking_id)
    .single();
  if (!b || b.status === "cancelled") throw new Error("This stay link has expired.");
  return { db, booking: b as typeof b & { properties: { host_id: string; timezone: string } } };
}

export const getStayServices = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { db, booking } = await stayBooking(data.token);
    const [{ data: jobs }, { data: msgs }] = await Promise.all([
      db
        .from("service_jobs")
        .select("id, category, title, status, eta_at, guest_price_pence, created_at, provider")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("messages")
        .select("id, body, created_at, job_id")
        .eq("booking_id", booking.id)
        .eq("channel", "stay_page")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    return {
      timezone: booking.properties.timezone ?? "Europe/London",
      jobs: (jobs ?? []).map((j) => ({
        id: j.id,
        category: j.category,
        title: j.title,
        status: j.status,
        etaAt: j.eta_at,
        pricePence: j.guest_price_pence,
        providerName: (j.provider as { name?: string } | null)?.name ?? null,
      })),
      messages: msgs ?? [],
    };
  });

export const createStayRequest = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        category: z.string().min(1).max(40),
        note: z.string().trim().max(500).nullable().default(null),
        urgent: z.boolean().default(false),
        wantedAt: z.string().datetime().nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const cat = categoryById(data.category);
    if (!cat || cat.kind === "maintenance") throw new Error("That service isn't available.");
    const { db, booking } = await stayBooking(data.token);

    // Light rate limit: at most 10 requests per stay per hour.
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db
      .from("service_jobs")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking.id)
      .gte("created_at", since);
    if ((count ?? 0) >= 10) throw new Error("You've sent a lot of requests. Please call your host.");

    const urgency = data.urgent ? "urgent" : cat.defaultUrgency;
    const { data: row, error } = await db
      .from("service_jobs")
      .insert({
        host_id: booking.properties.host_id,
        property_id: booking.property_id,
        room_id: booking.room_id,
        booking_id: booking.id,
        source: "guest",
        category: cat.id,
        title: cat.label,
        note: data.note,
        urgency,
        guest_price_pence: cat.guestPricePence,
        scheduled_at: data.wantedAt,
      })
      .select("id")
      .single();
    if (error) throw new Error("We couldn't send that. Please try again.");

    const { raiseAlert } = await import("./checkin.server");
    await raiseAlert({
      hostId: booking.properties.host_id,
      propertyId: booking.property_id,
      bookingId: booking.id,
      kind: "service_request",
      message: `${urgency === "urgent" ? "Urgent: " : ""}${cat.label}${data.note ? ` — ${data.note}` : ""}`,
    });
    return { id: row.id };
  });
