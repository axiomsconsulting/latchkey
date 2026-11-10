/* eslint-disable @typescript-eslint/no-explicit-any -- properties read loosely */
/**
 * Voice check-in (voice-concierge.ts): the host's switch and voice, whether their plan includes
 * it, and the kiosk's AI fallback for replies the rules didn't understand.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();

export const getVoiceAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    const { voicePlanAllowed } = await import("./voice.server");
    return { allowed: await voicePlanAllowed(hostId) };
  });

export const saveKioskVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ propertyId: uuid, on: z.boolean(), gender: z.enum(["female", "male"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const { voicePlanAllowed } = await import("./voice.server");
    if (data.on && !(await voicePlanAllowed(hostId)))
      throw new Error("Voice check-in comes with the Pro plan.");
    const { normaliseTheme } = await import("./theme");
    const { data: p, error: readErr } = await context.supabase
      .from("properties")
      .select("theme_config, short_code")
      .eq("id", data.propertyId)
      .single();
    if (readErr || !p) throw new Error("Property not found.");
    const theme = normaliseTheme({
      ...((p.theme_config as Record<string, unknown> | null) ?? {}),
      kioskVoice: data.on,
      kioskVoiceGender: data.gender,
    });
    const { error } = await context.supabase
      .from("properties")
      .update({ theme_config: theme as never })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { code: p.short_code as string };
  });

/** The kiosk didn't understand a reply: AI picks among the answers the screen expects. */
export const voiceIntent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(1).max(80),
        transcript: z.string().min(1).max(300),
        expected: z
          .array(z.string().regex(/^[a-z]+(-[A-Z])?$/))
          .min(1)
          .max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await (supabaseAdmin as any)
      .from("properties")
      .select("host_id, theme_config")
      .eq("short_code", data.code.toLowerCase())
      .maybeSingle();
    if (!p || (p.theme_config as { kioskVoice?: unknown } | null)?.kioskVoice !== true)
      return { intent: null };
    const { aiIntent } = await import("./voice.server");
    return { intent: await aiIntent(data.transcript, data.expected, p.host_id) };
  });

/**
 * Cloud listening: a door tablet whose browser can't listen sends one short recording of the
 * guest's reply; it comes back as text. Only while the host has voice check-in on.
 */
export const voiceTranscribe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(1).max(80),
        audio: z.string().max(1_500_000),
        mime: z
          .string()
          .regex(/^audio\/[a-z0-9.+-]+(;[a-z0-9=.,+ -]*)?$/i)
          .max(60),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await (supabaseAdmin as any)
      .from("properties")
      .select("host_id, theme_config")
      .eq("short_code", data.code.toLowerCase())
      .maybeSingle();
    if (!p || (p.theme_config as { kioskVoice?: unknown } | null)?.kioskVoice !== true)
      return { text: null };
    const { jobAllowed, bumpUsage } = await import("./usage.server");
    if (!(await jobAllowed("voice_ai"))) return { text: null };
    const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const { transcribeReply } = await import("./studio-voices.server");
    const text = await transcribeReply(bytes, data.mime.split(";")[0]!);
    await bumpUsage(p.host_id, "ai:voice_listen");
    return { text };
  });

/* ------------------------- Latchkey admin: studio voices ------------------------- */

async function superAdmin(supabase: unknown) {
  const { requireSuperAdmin } = await import("./roles");
  await requireSuperAdmin(supabase);
}

export const getStudioVoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await superAdmin(context.supabase);
    const { studioStatus } = await import("./studio-voices.server");
    return studioStatus();
  });

export const saveStudioVoiceKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await superAdmin(context.supabase);
    const { saveStudioKey } = await import("./studio-voices.server");
    await saveStudioKey(data.apiKey);
    return { ok: true };
  });

export const pickStudioVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        gender: z.enum(["female", "male"]),
        voiceId: z.string().min(1).max(80),
        name: z.string().min(1).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await superAdmin(context.supabase);
    const { chooseStudioVoice } = await import("./studio-voices.server");
    await chooseStudioVoice(data.gender, data.voiceId, data.name);
    return { ok: true };
  });

/** Records the next few phrases for one voice; the admin card calls it until nothing is left. */
export const recordStudioVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ gender: z.enum(["female", "male"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await superAdmin(context.supabase);
    const { recordSome } = await import("./studio-voices.server");
    return recordSome(data.gender);
  });

export const removeStudioVoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await superAdmin(context.supabase);
    const { forgetStudioVoices } = await import("./studio-voices.server");
    await forgetStudioVoices();
    return { ok: true };
  });
