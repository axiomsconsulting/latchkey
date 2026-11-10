/* eslint-disable @typescript-eslint/no-explicit-any -- hosts and site_settings read loosely */
/**
 * Server only: whether a business may use the door tablet's voice concierge (its plan includes
 * "voice_checkin", it's Pro, or it's complimentary), and the AI fallback that works out what a
 * guest meant when the rules didn't (voice-concierge.ts intentFor).
 */
import type { ThemeConfig } from "./theme";

async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function voicePlanAllowed(hostId: string): Promise<boolean> {
  const sb = await db();
  const [{ data: host }, { data: site }] = await Promise.all([
    sb.from("hosts").select("plan_key, subscription_status").eq("id", hostId).maybeSingle(),
    sb.from("site_settings").select("pricing_model").eq("id", 1).maybeSingle(),
  ]);
  if (host?.subscription_status === "comped") return true;
  if (host?.plan_key === "pro") return true;
  if (!site?.pricing_model) return false;
  const { normaliseModel, planFor } = await import("./pricing-model");
  return planFor(normaliseModel(site.pricing_model), host?.plan_key).features.includes(
    "voice_checkin",
  );
}

export async function voiceFor(
  hostId: string,
  theme: ThemeConfig,
): Promise<{ gender: "female" | "male"; clips: Record<string, string> } | null> {
  if (!theme.kioskVoice) return null;
  try {
    if (!(await voicePlanAllowed(hostId))) return null;
    // The studio recordings for that voice, where Latchkey admin has made them.
    const { clipsFor } = await import("./studio-voices.server");
    return { gender: theme.kioskVoiceGender, clips: await clipsFor(theme.kioskVoiceGender) };
  } catch {
    return null;
  }
}

/** What a guest's words most likely mean among the answers the screen expects; null if none. */
export async function aiIntent(
  transcript: string,
  expected: string[],
  hostId: string,
): Promise<string | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const { jobAllowed, bumpUsage } = await import("./usage.server");
  if (!(await jobAllowed("voice_ai"))) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
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
                "A hotel guest is checking in by voice. Speech recognition heard them say: " +
                JSON.stringify(transcript.slice(0, 200)) +
                ". Which one of these answers did they mean? Answers: " +
                expected.join(", ") +
                ". Letters are given as letter-X for the first letter of their surname. " +
                "Reply with the answer exactly, or none if it's none of them.",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "intent",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { intent: { type: "string", enum: [...expected, "none"] } },
            required: ["intent"],
          },
        },
      },
    }),
  });
  if (!res.ok || !res.body) return null;
  await bumpUsage(hostId, "ai:voice_intent");
  const { readAiStream } = await import("./ai-stream");
  try {
    const out = JSON.parse(await readAiStream(res.body)) as { intent?: string };
    return out.intent && out.intent !== "none" && expected.includes(out.intent) ? out.intent : null;
  } catch {
    return null;
  }
}
