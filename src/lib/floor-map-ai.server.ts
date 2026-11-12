/**
 * Server only: reads a floor plan picture with AI (Lovable's gateway) and turns what it sees into
 * proposed marks (floor-map.ts marksFromReading). Nothing is saved here: the host checks the marks
 * in the editor and saves them. The picture is a plan of the building, never of guests.
 */
import { PLAN_PROMPT, PLAN_SCHEMA, marksFromReading } from "./floor-map";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

export async function readPlanPicture(
  imagePath: string,
  level: number,
  rooms: Array<{ id: string; name: string }>,
) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Reading plans isn't set up yet.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: file, error } = await supabaseAdmin.storage.from("guides").download(imagePath);
  if (error || !file) throw new Error("Couldn't open the plan picture.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = /\.png$/i.test(imagePath) ? "png" : /\.webp$/i.test(imagePath) ? "webp" : "jpeg";
  const res = await fetch(GATEWAY, {
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
      reasoning: { effort: "medium", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: PLAN_PROMPT },
            {
              type: "input_image",
              image_url: `data:image/${type};base64,${bytes.toString("base64")}`,
            },
          ],
        },
      ],
      text: {
        format: { type: "json_schema", name: "floor_plan", strict: true, schema: PLAN_SCHEMA },
      },
    }),
  });
  if (!res.ok || !res.body)
    throw new Error(
      res.status === 402
        ? "Reading plans is resting just now: draw the areas yourself."
        : "Couldn't read the plan just now.",
    );
  const { readAiStream } = await import("./ai-stream");
  try {
    return marksFromReading(JSON.parse(await readAiStream(res.body)), level, rooms);
  } catch {
    return null;
  }
}
