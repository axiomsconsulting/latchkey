import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("state"),
    device: z.string().max(80).optional(),
    detected: z.boolean().optional(),
    screen: z
      .object({
        view: z.enum(["start", "cards", "welcome", "saver"]),
        lite: z.boolean().optional(),
        fullscreen: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({ action: z.literal("express"), handle: z.string().max(300) }),
  z.object({ action: z.literal("picker"), device: z.string().min(24).max(80) }),
  z.object({
    action: z.literal("setCards"),
    device: z.string().min(24).max(80),
    changes: z
      .array(
        z.object({ handle: z.string().max(300), kind: z.enum(["in", "out"]), show: z.boolean() }),
      )
      .max(100),
  }),
]);

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * The compatible kiosk's one door to Latchkey (public/kiosk-lite.js, plain
 * JSON for old browsers): the same server functions as the full kiosk.
 */
export const Route = createFileRoute("/api/public/kiosk-lite/$code")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const code = params.code.toLowerCase();
        if (!/^[a-z0-9-]{2,40}$/.test(code)) return json({ error: "bad code" }, 400);
        let input: z.infer<typeof body>;
        try {
          input = body.parse(JSON.parse(await request.text()));
        } catch {
          return json({ error: "bad request" }, 400);
        }
        try {
          if (input.action === "state") {
            const { liteState } = await import("@/lib/kiosk-lite.server");
            return json(await liteState(code, input, request.headers.get("user-agent") ?? ""));
          }
          if (input.action === "express") {
            const { kioskExpressCheckout } = await import("@/lib/goodbye.functions");
            const r = await kioskExpressCheckout({ data: { code, handle: input.handle } });
            const { qrSvg } = await import("@/lib/kiosk-lite.server");
            const url = r.reviewCode ? `${new URL(request.url).origin}/g/${r.reviewCode}` : null;
            return json({ ...r, reviewUrl: url, reviewQr: url ? await qrSvg(url) : "" });
          }
          if (input.action === "picker") {
            const { kioskCardPicker } = await import("@/lib/goodbye.functions");
            return json(await kioskCardPicker({ data: { code, device: input.device } }));
          }
          const { kioskSetCards } = await import("@/lib/goodbye.functions");
          return json(
            await kioskSetCards({
              data: { code, device: input.device, changes: input.changes },
            }),
          );
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "failed" }, 500);
        }
      },
    },
  },
});
