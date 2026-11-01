/* eslint-disable @typescript-eslint/no-explicit-any -- guest_messages and hosts.whatsapp are from migration 0080 */
/**
 * Settings → Guests → Welcome and goodbye messages (rules in
 * src/lib/guest-messages.ts, sending in guest-messages.server.ts), the
 * business asking Latchkey support to connect its own WhatsApp number, and
 * the super admin connecting it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_GUEST_MESSAGES,
  fillMessage,
  normaliseGuestMessages,
  SAMPLE_VARS,
} from "./guest-messages";
import { hostOfProperty, requireOwner, requireSuperAdmin, requireWrite } from "./roles";

const uuid = z.string().uuid();

async function admin(): Promise<{ from: (t: string) => any }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

const choice = z.object({
  on: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  text: z.string().min(1).max(600),
});
const settings = z.object({
  welcome: choice,
  goodbye: choice,
  phone: z.enum(["auto", "sms", "whatsapp", "none"]),
  email: z.boolean(),
  attachmentId: uuid.nullable(),
});

export const getGuestMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as { from: (t: string) => any };
    const { data: p, error } = await sb
      .from("properties")
      .select("id, host_id, name, short_code, guest_messages")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error && /guest_messages/.test(error.message)) return { available: false as const };
    if (!p) throw new Error("Property not found.");
    const db = await admin();
    const [{ guestChannels }, { publicOrigin }, wa, files] = await Promise.all([
      import("./guest-messaging.server"),
      import("./integrations.server"),
      db.from("hosts").select("whatsapp").eq("id", p.host_id).maybeSingle(),
      db
        .from("guide_attachments")
        .select("id, name, kind")
        .eq("property_id", p.id)
        .in("kind", ["pdf", "image"])
        .order("created_at"),
    ]);
    const ch = await guestChannels(p.host_id);
    const w = (wa.data?.whatsapp ?? null) as {
      status?: string;
      number?: string;
      sender?: string;
    } | null;
    return {
      available: true as const,
      settings: p.guest_messages
        ? normaliseGuestMessages(p.guest_messages)
        : DEFAULT_GUEST_MESSAGES,
      saved: !!p.guest_messages,
      property: { name: p.name as string, code: p.short_code as string },
      origin: publicOrigin(),
      channels: {
        demo: ch.demo,
        sms: ch.sms,
        whatsapp: ch.whatsapp,
        templates: {
          welcome: !!ch.whatsappTemplates.welcome,
          goodbye: !!ch.whatsappTemplates.goodbye,
        },
      },
      whatsapp: {
        status: (w?.status as "none" | "requested" | "live" | undefined) ?? "none",
        number: w?.sender ?? w?.number ?? null,
        shared: ch.whatsapp && w?.status !== "live" ? ch.sender : null,
      },
      attachments: ((files.data ?? []) as Array<{ id: string; name: string }>).map((f) => ({
        id: f.id,
        name: f.name,
      })),
    };
  });

export const saveGuestMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, settings }).parse(d))
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const sb = context.supabase as unknown as { from: (t: string) => any };
    const { error } = await sb
      .from("properties")
      .update({ guest_messages: normaliseGuestMessages(data.settings) })
      .eq("id", data.propertyId);
    if (error)
      throw new Error(
        /guest_messages/.test(error.message)
          ? "Welcome and goodbye messages need the latest update (migration 0080)."
          : error.message,
      );
    return { ok: true };
  });

/** A test of the welcome or goodbye to the host's own phone or email, with sample details. */
export const sendTestGuestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        kind: z.enum(["welcome", "goodbye"]),
        text: z.string().min(1).max(600),
        to: z.string().min(5).max(200),
        via: z.enum(["sms", "whatsapp", "email"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const db = await admin();
    const { data: p } = await db
      .from("properties")
      .select("name, short_code")
      .eq("id", data.propertyId)
      .single();
    const { publicOrigin } = await import("./integrations.server");
    const vars = {
      ...SAMPLE_VARS(p.name, publicOrigin()),
      book: `${publicOrigin()}/book/${p.short_code}`,
    };
    const body = fillMessage(data.text, vars);
    if (data.via === "email") {
      const { hostModes } = await import("./checkin.server");
      if ((await hostModes(hostId)).guest_messages !== "live") return { status: "demo" as const };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.to)) return { status: "bad_address" as const };
      const { sendGuestEmail } = await import("./alert-email.server");
      const ok = await sendGuestEmail({
        to: data.to,
        subject: `Test: ${data.kind === "welcome" ? `Welcome to ${p.name}` : `Thank you for staying at ${p.name}`}`,
        body,
        from: p.name,
      });
      return { status: ok ? ("sent" as const) : ("failed" as const) };
    }
    const { checkPhone } = await import("./world");
    const c = checkPhone(data.to, "GB");
    if (!c.ok) return { status: "bad_number" as const };
    const { sendGuestText } = await import("./guest-messaging.server");
    const status = await sendGuestText({
      hostId,
      to: c.e164,
      channel: data.via,
      body,
      template: {
        key: data.kind,
        vars: [vars.name, p.name, data.kind === "welcome" ? vars.guide : vars.book],
      },
    });
    return { status };
  });

/** The owner asks Latchkey support to connect the business's own WhatsApp number. */
export const requestWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ hostId: uuid, number: z.string().min(8).max(20), note: z.string().max(500) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    const { checkPhone } = await import("./world");
    const c = checkPhone(data.number, "GB");
    if (!c.ok) return { ok: false as const, reason: "bad_number" as const };
    const db = await admin();
    const { error } = await db
      .from("hosts")
      .update({
        whatsapp: { status: "requested", number: c.e164, requested_at: new Date().toISOString() },
      })
      .eq("id", data.hostId);
    if (error) throw new Error("Connecting WhatsApp needs the latest update (migration 0080).");
    const { data: u } = await context.supabase.auth.getUser();
    // Lands in Latchkey admin → Feedback, where support picks it up.
    await db.from("feedback").insert({
      kind: "feature",
      host_id: data.hostId,
      user_id: u.user?.id ?? null,
      page: "/app/settings?focus=guestTexts",
      message: `WhatsApp: please connect our number ${c.e164}.${data.note.trim() ? ` ${data.note.trim()}` : ""}`,
    });
    return { ok: true as const };
  });

/** Latchkey support: the business's own WhatsApp sender is live (or taken off). */
export const setHostWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: uuid,
        sender: z
          .string()
          .regex(/^\+[1-9]\d{7,14}$/)
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    await db
      .from("hosts")
      .update({
        whatsapp: data.sender
          ? { status: "live", sender: data.sender, connected_at: new Date().toISOString() }
          : null,
      })
      .eq("id", data.hostId);
    return { ok: true };
  });

/** Latchkey admin → Integrations: the shared WhatsApp number and Meta-approved templates. */
export const getWhatsAppAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { whatsAppSettings } = await import("./guest-messaging.server");
    const { twilio } = await import("./integrations.server");
    const db = await admin();
    const { data } = await db
      .from("site_settings")
      .select("integrations")
      .eq("id", 1)
      .maybeSingle();
    const raw = (data?.integrations?.whatsapp ?? {}) as { sender?: string; templates?: unknown };
    const w = await whatsAppSettings();
    return {
      twilio: !!twilio(),
      // What's saved here (the server's TWILIO_WHATSAPP_FROM is used when this is empty).
      sender: typeof raw.sender === "string" ? raw.sender : "",
      effectiveSender: w.sender,
      templates: w.templates,
    };
  });

export const saveWhatsAppAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sender: z.union([z.literal(""), z.string().regex(/^\+[1-9]\d{7,14}$/)]),
        templates: z.object({
          photo_link: z.union([z.literal(""), z.string().regex(/^HX[0-9a-fA-F]{32}$/)]),
          welcome: z.union([z.literal(""), z.string().regex(/^HX[0-9a-fA-F]{32}$/)]),
          goodbye: z.union([z.literal(""), z.string().regex(/^HX[0-9a-fA-F]{32}$/)]),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { data: cur } = await db
      .from("site_settings")
      .select("integrations")
      .eq("id", 1)
      .maybeSingle();
    const { error } = await db
      .from("site_settings")
      .update({
        integrations: {
          ...(cur?.integrations ?? {}),
          whatsapp: {
            sender: data.sender || null,
            templates: Object.fromEntries(
              Object.entries(data.templates).map(([k, v]) => [k, v || null]),
            ),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Latchkey admin → Businesses: the viewed business's own WhatsApp number, as asked for. */
export const getHostWhatsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const db = await admin();
    const { data: h, error } = await db
      .from("hosts")
      .select("whatsapp")
      .eq("id", data.hostId)
      .maybeSingle();
    if (error) return { available: false as const };
    const w = (h?.whatsapp ?? null) as { status?: string; number?: string; sender?: string } | null;
    return {
      available: true as const,
      status: w?.status ?? "none",
      number: w?.sender ?? w?.number ?? null,
    };
  });
