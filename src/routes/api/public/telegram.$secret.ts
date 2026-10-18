import { createFileRoute } from "@tanstack/react-router";
import { rebrand } from "@/lib/brand";

/**
 * Telegram tells Latchkey when someone talks to the bot. "/start <code>"
 * (from the host's Connect Telegram link) links that chat to the business.
 */
export const Route = createFileRoute("/api/public/telegram/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { telegramSecret, telegramCall } = await import("@/lib/integrations.server");
        const secret = await telegramSecret();
        if (!secret || params.secret !== secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
          return new Response(null, { status: 403 });
        }
        try {
          const update = (await request.json()) as { message?: { chat?: { id: number }; from?: { username?: string }; text?: string } };
          const chatId = update.message?.chat?.id;
          const text = update.message?.text?.trim() ?? "";
          if (!chatId) return Response.json({ ok: true });
          const code = /^\/start\s+([a-z0-9]{12,32})$/.exec(text)?.[1];
          if (!code) {
            await telegramCall("sendMessage", { chat_id: chatId, text: rebrand("Hello from Latchkey. To get alerts here, open Latchkey → Settings → Notifications and tap Connect Telegram.") });
            return Response.json({ ok: true });
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as unknown as { from: (t: string) => any };
          const { data: link } = await db.from("telegram_link_codes").select("host_id, user_id, expires_at").eq("code", code).maybeSingle();
          if (!link || Date.parse(link.expires_at) < Date.now()) {
            await telegramCall("sendMessage", { chat_id: chatId, text: rebrand("That link has expired. Tap Connect Telegram in Latchkey again.") });
            return Response.json({ ok: true });
          }
          await db.from("telegram_link_codes").delete().eq("code", code);
          await db.from("telegram_links").upsert(
            { host_id: link.host_id, user_id: link.user_id, chat_id: chatId, username: update.message?.from?.username ?? null },
            { onConflict: "host_id,chat_id" },
          );
          const { data: host } = await db.from("hosts").select("business_name").eq("id", link.host_id).maybeSingle();
          await telegramCall("sendMessage", { chat_id: chatId, text: `Connected. Alerts for ${host?.business_name ?? "your business"} will arrive here.` });
        } catch {
          // Telegram retries anything that isn't a 200; a bad update isn't worth retrying.
        }
        return Response.json({ ok: true });
      },
    },
  },
});
