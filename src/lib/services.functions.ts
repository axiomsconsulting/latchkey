/**
 * Host-side services hub: guest requests, Contra recommendations and booking,
 * scheduled maintenance, theme and integration switches.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INTEGRATION_KEYS, normaliseModes } from "./integration-modes";
import { categoryById, recommendProviders, type Provider } from "./services";
import { normaliseTheme, RESERVED_SLUGS } from "./theme";

const uuid = z.string().uuid();

async function hostContext(supabase: any, hostId: string) {
  const { data } = await supabase.from("hosts").select("id, integration_modes, currency").eq("id", hostId).single();
  if (!data) throw new Error("Business not found.");
  return { modes: normaliseModes(data.integration_modes), currency: data.currency as string };
}

/* ------------------------------ integrations ------------------------------ */

export const getIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { modes } = await hostContext(context.supabase, data.hostId);
    const { contraLiveReady } = await import("./contra.server");
    return {
      modes,
      ready: {
        contra: contraLiveReady(),
        id_check: Boolean(process.env["LOVABLE_API_KEY"]),
        host_email: false, // needs a sender email domain
        guest_messages: true, // stay page always works; email copy needs a sender domain
      },
    };
  });

export const saveIntegrationModes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid,
        modes: z.object(Object.fromEntries(INTEGRATION_KEYS.map((k) => [k, z.enum(["demo", "live"])])) as Record<string, z.ZodEnum<["demo", "live"]>>),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("hosts")
      .update({ integration_modes: normaliseModes(data.modes) })
      .eq("id", data.hostId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------------- theme --------------------------------- */

export const saveTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        theme: z.record(z.string(), z.unknown()),
        shortCode: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,30}$/, "Use 3–30 letters, numbers or dashes."),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (RESERVED_SLUGS.has(data.shortCode)) throw new Error("That link name is reserved. Try another.");
    const { error } = await context.supabase
      .from("properties")
      .update({ theme_config: normaliseTheme(data.theme), short_code: data.shortCode })
      .eq("id", data.propertyId);
    if (error) {
      if (error.code === "23505") throw new Error("That link name is already taken.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

/** Uploads a logo or font into private storage and returns a long-lived link. */
export const uploadBrandAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        kind: z.enum(["logo", "font"]),
        filename: z.string().max(120),
        dataUrl: z.string().max(4_200_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // RLS check: the caller must be able to read this property.
    const { data: prop } = await context.supabase.from("properties").select("id").eq("id", data.propertyId).maybeSingle();
    if (!prop) throw new Error("Property not found.");

    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(data.dataUrl);
    if (!m) throw new Error("That file couldn't be read.");
    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "";
    const allowed = data.kind === "logo" ? ["png", "jpg", "jpeg", "webp", "svg"] : ["ttf", "otf", "woff", "woff2"];
    if (!allowed.includes(ext)) throw new Error(`Please upload a ${allowed.join(", ")} file.`);
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > 3 * 1024 * 1024) throw new Error("Files must be under 3 MB.");

    const contentType =
      data.kind === "logo"
        ? ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`
        : `font/${ext === "otf" ? "otf" : ext}`;
    const path = `${data.propertyId}/${data.kind}-${Date.now()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("branding").upload(path, bytes, { contentType, upsert: true });
    if (up.error) throw new Error(up.error.message);
    const signed = await supabaseAdmin.storage.from("branding").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl };
  });

/* --------------------------------- jobs ---------------------------------- */

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: jobs, error } = await context.supabase
      .from("service_jobs")
      .select("*, rooms(display_name), bookings(guest_full_name)")
      .eq("property_id", data.propertyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { jobs: jobs ?? [] };
  });

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, category: z.string().nullable().default(null) }).parse(d))
  .handler(async ({ data, context }) => {
    const { modes } = await hostContext(context.supabase, data.hostId);
    const { searchProviders } = await import("./contra.server");
    try {
      return { mode: modes.contra, providers: await searchProviders(modes.contra, data.category, "High Wycombe"), error: null };
    } catch (err) {
      return { mode: modes.contra, providers: [] as Provider[], error: err instanceof Error ? err.message : "Contra is unavailable." };
    }
  });

export const recommendForJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase
      .from("service_jobs")
      .select("id, host_id, category, urgency, scheduled_at, properties(timezone, postcode)")
      .eq("id", data.jobId)
      .single();
    if (!job) throw new Error("Request not found.");
    const { modes } = await hostContext(context.supabase, job.host_id);
    const { searchProviders } = await import("./contra.server");
    const tz = (job as any).properties?.timezone ?? "Europe/London";
    try {
      const providers = await searchProviders(modes.contra, job.category, (job as any).properties?.postcode ?? null);
      const recs = recommendProviders(providers, job.category, {
        now: new Date(),
        tz,
        wantedAt: job.scheduled_at ? new Date(job.scheduled_at) : null,
        urgency: job.urgency as "low" | "normal" | "urgent",
      });
      return { mode: modes.contra, recommendations: recs.slice(0, 4), error: null };
    } catch (err) {
      return { mode: modes.contra, recommendations: [], error: err instanceof Error ? err.message : "Contra is unavailable." };
    }
  });

async function messageGuest(supabase: any, jobId: string, bookingId: string | null, body: string) {
  if (!bookingId) return;
  await supabase.from("messages").insert({
    booking_id: bookingId,
    job_id: jobId,
    channel: "stay_page",
    direction: "outbound",
    body,
    sent_at: new Date().toISOString(),
  });
}

function ukTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export const acknowledgeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("service_jobs")
      .update({ status: "acknowledged", acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", data.jobId)
      .select("id, booking_id, title")
      .single();
    if (error) throw new Error(error.message);
    await messageGuest(context.supabase, job.id, job.booking_id, `Thanks — your host has seen "${job.title}" and is arranging it now.`);
    return { ok: true };
  });

export const appointProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: uuid, providerId: z.string().min(1).max(120), etaIso: z.string().datetime() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase
      .from("service_jobs")
      .select("id, host_id, category, title, note, booking_id, properties(timezone, address_line1, postcode)")
      .eq("id", data.jobId)
      .single();
    if (!job) throw new Error("Request not found.");
    const { modes } = await hostContext(context.supabase, job.host_id);
    const { searchProviders, bookProvider } = await import("./contra.server");
    const providers = await searchProviders(modes.contra, job.category, null);
    const provider = providers.find((p) => p.id === data.providerId);
    if (!provider) throw new Error("That provider is no longer available.");
    const prop = (job as any).properties ?? {};
    const booked = await bookProvider(modes.contra, {
      provider,
      category: job.category,
      title: job.title,
      note: job.note,
      etaIso: data.etaIso,
      address: [prop.address_line1, prop.postcode].filter(Boolean).join(", ") || null,
    });
    const { error } = await context.supabase
      .from("service_jobs")
      .update({
        status: "booked",
        provider: { id: provider.id, name: provider.name, rating: provider.rating, contraUrl: provider.contraUrl, rateUnit: provider.rateUnit, ratePence: provider.ratePence },
        provider_mode: modes.contra,
        provider_ref: booked.ref,
        quoted_pence: booked.quotedPence,
        eta_at: booked.confirmedEtaIso,
        acknowledged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (error) throw new Error(error.message);
    const tz = prop.timezone ?? "Europe/London";
    await messageGuest(
      context.supabase,
      job.id,
      job.booking_id,
      `Good news — ${provider.name} is booked for "${job.title}". Expected ${ukTime(booked.confirmedEtaIso, tz)}.`,
    );
    return { ok: true, ref: booked.ref };
  });

export const setJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: uuid, status: z.enum(["in_progress", "done", "declined", "cancelled"]), note: z.string().max(300).nullable().default(null) }).parse(d))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { data: job, error } = await context.supabase
      .from("service_jobs")
      .update({ status: data.status, updated_at: now, completed_at: data.status === "done" ? now : null })
      .eq("id", data.jobId)
      .select("id, booking_id, title")
      .single();
    if (error) throw new Error(error.message);
    const text =
      data.status === "done" ? `"${job.title}" is sorted. Let us know if anything else is needed.`
      : data.status === "declined" ? `Sorry, we can't arrange "${job.title}" this time.${data.note ? ` ${data.note}` : ""}`
      : data.status === "in_progress" ? `"${job.title}" is under way now.`
      : null;
    if (text) await messageGuest(context.supabase, job.id, job.booking_id, text);
    return { ok: true };
  });

export const createHostJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid,
        propertyId: uuid,
        roomId: uuid.nullable().default(null),
        category: z.string().min(1).max(40),
        title: z.string().trim().min(2).max(120),
        note: z.string().max(1000).nullable().default(null),
        scheduledAt: z.string().datetime().nullable().default(null),
        urgency: z.enum(["low", "normal", "urgent"]).default("low"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const cat = categoryById(data.category);
    if (!cat) throw new Error("Unknown service.");
    const { data: row, error } = await context.supabase
      .from("service_jobs")
      .insert({
        host_id: data.hostId,
        property_id: data.propertyId,
        room_id: data.roomId,
        source: cat.kind === "maintenance" ? "maintenance" : "host",
        category: data.category,
        title: data.title,
        note: data.note,
        scheduled_at: data.scheduledAt,
        urgency: data.urgency,
        status: "acknowledged",
        acknowledged_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
