/**
 * One-off AI shortlist of the trades a new listing usually needs.
 *
 * It does NOT invent phone numbers or company names: directories forbid that
 * and made-up contacts are worse than none. It returns the *roles* a host in
 * this area should line up, with a search phrase and a sensible priority, so
 * the host fills in the real numbers once and never thinks about it again.
 */

import { createLovableAiGatewayRunIdFetch } from "./ai-run-id.server";
import { region } from "./regions";
import { TRADE_CATEGORIES } from "./trade-contacts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

export type SuggestedTrade = {
  category: string;
  role: string;
  why: string;
  searchTerm: string;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["trades"],
  properties: {
    trades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "role", "why", "searchTerm"],
        properties: {
          category: { type: "string", enum: TRADE_CATEGORIES.map((c) => c.id) },
          role: { type: "string" },
          why: { type: "string" },
          searchTerm: { type: "string" },
        },
      },
    },
  },
} as const;

/** Reads an SSE stream and returns the finished text. */
async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string; text?: string };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
        if (event.type === "response.output_text.done" && typeof event.text === "string" && !text) text = event.text;
      } catch {
        // partial frame: ignore and wait for the rest
      }
    }
  }
  return text;
}

export async function suggestTrades(input: {
  propertyName: string;
  area: string;
  countryCode: string;
  rooms: number;
}): Promise<SuggestedTrade[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI suggestions are not switched on for this workspace yet.");
  const r = region(input.countryCode);
  const gateway = createLovableAiGatewayRunIdFetch();

  const prompt = [
    `A host lets ${input.rooms} room(s) at "${input.propertyName}" in ${input.area || r.country} (${r.country}).`,
    "List the 8 to 10 trades and services they should have a number for before their first guest arrives.",
    "Use the local words for each trade in that country and mention any legal or safety check that country expects.",
    "Never invent company names, phone numbers, ratings or websites. Only describe the role.",
    "searchTerm must be the phrase a host would type into a local trade directory, including the area.",
    "Return JSON.",
  ].join(" ");

  const res = await gateway.fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: prompt }],
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      text: { format: { type: "json_schema", name: "trade_shortlist", strict: true, schema: SCHEMA } },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("The AI service is busy. Please try again in a minute.");
    if (res.status === 402) throw new Error("This workspace has run out of AI credits.");
    throw new Error(detail.slice(0, 200) || "The AI suggestion service is unavailable right now.");
  }

  const text = await readStream(res.body);
  if (!text.trim()) throw new Error("The AI service returned nothing. Please try again.");
  const parsed = JSON.parse(text) as { trades?: SuggestedTrade[] };
  return (parsed.trades ?? []).slice(0, 12);
}
