/**
 * Server only: is the AI service (Lovable's gateway) answering? A tiny real request for Latchkey
 * admin's Test all connections, and the last refusal each feature met (kept in memory on the
 * server that met it), so "couldn't answer" can be told apart: out of credits, too many requests,
 * a model or request the service refused, or no key. Never returns the key.
 */
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
export const AI_MODEL = "openai/gpt-6-astra";

type Failure = { feature: string; status: number; message: string; at: string };
const failures = new Map<string, Failure>();

/** What the service said, in a line: its own error message when it gives one. */
export function aiMessage(status: number, body: string): string {
  let said = "";
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    said = typeof j.error === "string" ? j.error : (j.error?.message ?? j.message ?? "");
  } catch {
    said = body;
  }
  said = said.replace(/\s+/g, " ").trim().slice(0, 200);
  const plain =
    status === 402
      ? "out of AI credits"
      : status === 429
        ? "too many requests a minute"
        : status === 401 || status === 403
          ? "the key was refused"
          : `answered ${status}`;
  return said ? `${plain}: ${said}` : plain;
}

export function noteAiFailure(feature: string, status: number, body: string) {
  failures.set(feature, {
    feature,
    status,
    message: aiMessage(status, body),
    at: new Date().toISOString(),
  });
}

export function lastAiFailures(): Failure[] {
  return [...failures.values()];
}

/** One small request in the same shape the features use (streamed, structured answer). */
export async function probeAi(): Promise<{ ok: boolean; detail: string; configured: boolean }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ok: false, configured: false, detail: "No LOVABLE_API_KEY" };
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      stream: true,
      store: false,
      input: [{ role: "user", content: [{ type: "input_text", text: "Reply with ok." }] }],
      text: {
        format: {
          type: "json_schema",
          name: "probe",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { reply: { type: "string" } },
            required: ["reply"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    return { ok: false, configured: true, detail: aiMessage(res.status, body) };
  }
  const { readAiStream } = await import("./ai-stream");
  const text = await readAiStream(res.body).catch(() => "");
  const recent = lastAiFailures()
    .map((f) => `${f.feature} last failed ${f.at.slice(0, 16).replace("T", " ")}: ${f.message}`)
    .join("; ");
  return {
    ok: !!text,
    configured: true,
    detail: text
      ? `Answering (${AI_MODEL})${recent ? `. ${recent}` : ""}`
      : "Answered with nothing",
  };
}
