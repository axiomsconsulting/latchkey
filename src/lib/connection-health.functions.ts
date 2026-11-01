/**
 * Latchkey admin → Integrations → Test all connections: a real, harmless
 * call to each outside service (nothing is sent to anyone) and the exact
 * fix for anything not working. Never returns a key.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { line, sortLines, type HealthLine } from "./connection-health";
import { requireSuperAdmin } from "./roles";

const env = (k: string) => !!(process.env[k] ?? "").trim();

async function timed<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("No answer in 10 seconds")), 10_000),
    ),
  ]);
}

const why = (e: unknown) => (e instanceof Error ? e.message : "Didn't answer");

export const testConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HealthLine[]> => {
    await requireSuperAdmin(context.supabase);
    const checks: Array<Promise<HealthLine>> = [
      // Stripe: who the key belongs to, and the webhook secrets.
      (async () => {
        const { stripeReady, stripeCall, stripeLiveMode } = await import("./stripe.server");
        if (!stripeReady())
          return line("stripe", "Stripe", {
            configured: false,
            fix: "Add STRIPE_SECRET_KEY in Lovable Cloud → Secrets.",
          });
        try {
          const acct = await timed(() => stripeCall<{ id: string }>("/v1/account"));
          const hooks = env("STRIPE_WEBHOOK_SECRET");
          return line("stripe", "Stripe", {
            configured: true,
            ok: true,
            warn: !hooks,
            detail: `${stripeLiveMode() ? "Live" : "Test"} mode, account ${acct.id}${hooks ? "" : ", no webhook secret"}`,
            fix: "Add STRIPE_WEBHOOK_SECRET (and STRIPE_CONNECT_WEBHOOK_SECRET for hosts' accounts) from Stripe → Developers → Webhooks.",
          });
        } catch (e) {
          return line("stripe", "Stripe", {
            configured: true,
            ok: false,
            detail: why(e),
            fix: "Check the key in Stripe → Developers → API keys and replace STRIPE_SECRET_KEY.",
          });
        }
      })(),
      // Twilio: the account answers (texts to hosts and guests).
      (async () => {
        const { twilio } = await import("./integrations.server");
        const t = twilio();
        if (!t)
          return line("twilio", "Twilio (texts, WhatsApp)", {
            configured: false,
            optional: true,
            fix: "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM in Secrets.",
          });
        try {
          const res = await timed(() =>
            fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(t.sid)}.json`, {
              headers: { Authorization: `Basic ${btoa(`${t.sid}:${t.token}`)}` },
            }),
          );
          const body = (await res.json().catch(() => ({}))) as { status?: string };
          return line("twilio", "Twilio (texts, WhatsApp)", {
            configured: true,
            ok: res.ok && body.status === "active",
            detail: res.ok
              ? `Account ${body.status ?? "unknown"}`
              : `Twilio answered ${res.status}`,
            fix: "Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Twilio's console, and that the account is active (not suspended or out of credit).",
          });
        } catch (e) {
          return line("twilio", "Twilio (texts, WhatsApp)", {
            configured: true,
            ok: false,
            detail: why(e),
            fix: "Twilio didn't answer: try again; if it persists, check status.twilio.com.",
          });
        }
      })(),
      // WhatsApp: a sender and the approved templates.
      (async () => {
        const { whatsAppSettings } = await import("./guest-messaging.server");
        const w = await whatsAppSettings();
        const missing = Object.entries(w.templates)
          .filter(([, v]) => !v)
          .map(([k]) => k);
        if (!w.sender)
          return line("whatsapp", "WhatsApp for guests", {
            configured: false,
            optional: true,
            fix: "Register Latchkey's WhatsApp number in Twilio and enter it under WhatsApp for guests (docs/whatsapp.md).",
          });
        return line("whatsapp", "WhatsApp for guests", {
          configured: true,
          ok: true,
          warn: missing.length > 0,
          detail: missing.length
            ? `Sender ${w.sender}; no template for ${missing.join(", ")}`
            : `Sender ${w.sender}, all templates`,
          fix: "Make the missing templates in Twilio's Content builder, get them approved, and paste their HX ids.",
        });
      })(),
      // Google Drive: the connected account answers (private records).
      (async () => {
        const { driveConfigured, driveConnection, drive } = await import("./drive.server");
        if (!driveConfigured())
          return line("drive", "Google Drive (private records)", {
            configured: false,
            fix: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Secrets, then Connect Google Drive below.",
          });
        const conn = await driveConnection().catch(() => null);
        if (!conn)
          return line("drive", "Google Drive (private records)", {
            configured: false,
            fix: "Connect Google Drive below (Integrations → Google Drive).",
          });
        try {
          const res = await timed(() => drive("/drive/v3/about?fields=user(emailAddress)"));
          const { driveQueueStatus } = await import("./private-store.server");
          const waiting = (await driveQueueStatus().catch(() => null))?.waiting ?? 0;
          return line("drive", "Google Drive (private records)", {
            configured: true,
            ok: res.ok,
            warn: waiting > 20,
            detail: res.ok
              ? `Connected${waiting ? `, ${waiting} file(s) waiting to move` : ""}`
              : `Google answered ${res.status}`,
            fix: res.ok
              ? "Files are piling up in the queue: Integrations → Move them now."
              : "Reconnect Google Drive below. If it keeps dropping after 7 days, set the Google OAuth app to In production.",
          });
        } catch (e) {
          return line("drive", "Google Drive (private records)", {
            configured: true,
            ok: false,
            detail: why(e),
            fix: "Reconnect Google Drive below.",
          });
        }
      })(),
      // Email: the managed sender's settings (no email is sent).
      (async () =>
        env("LOVABLE_API_KEY")
          ? line("email", "Email (alerts, guest messages)", {
              configured: true,
              ok: true,
              detail: "Sender configured",
              fix: "",
            })
          : line("email", "Email (alerts, guest messages)", {
              configured: false,
              fix: "Email is set up by Lovable Cloud: check Lovable → Cloud → Emails.",
            }))(),
      // Telegram: the bot answers.
      (async () => {
        const { telegramToken, telegramCall } = await import("./integrations.server");
        if (!telegramToken())
          return line("telegram", "Telegram (host alerts)", {
            configured: false,
            optional: true,
            fix: "Add TELEGRAM_BOT_TOKEN from @BotFather in Secrets.",
          });
        const r = await timed(() => telegramCall<{ username?: string }>("getMe", {})).catch(
          (e: unknown) =>
            ({ ok: false, description: why(e) }) as {
              ok: boolean;
              description?: string;
              result?: { username?: string };
            },
        );
        return line("telegram", "Telegram (host alerts)", {
          configured: true,
          ok: r.ok,
          detail: r.ok ? `Bot @${r.result?.username ?? "?"}` : (r.description ?? "No answer"),
          fix: "Check TELEGRAM_BOT_TOKEN with @BotFather, then Integrations → Point the bot at Latchkey.",
        });
      })(),
      // App notifications: the keys.
      (async () =>
        env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY")
          ? line("push", "App notifications", {
              configured: true,
              ok: true,
              detail: "Keys set",
              fix: "",
            })
          : line("push", "App notifications", {
              configured: false,
              optional: true,
              fix: "Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Secrets.",
            }))(),
      // Booking-site emails forwarded to Latchkey.
      (async () => {
        const { inboundSecret, integrationSettings } = await import("./integrations.server");
        const s = await integrationSettings();
        if (!inboundSecret() || !s.inboundAddress)
          return line("inbound", "Booking-site messages by email", {
            configured: false,
            optional: true,
            fix: "Add INBOUND_EMAIL_SECRET in Secrets and the forwarding address below (docs/go-live.md).",
          });
        return line("inbound", "Booking-site messages by email", {
          configured: true,
          ok: true,
          detail: `Address ${s.inboundAddress}`,
          fix: "",
        });
      })(),
      // Listing import.
      (async () =>
        env("FIRECRAWL_API_KEY")
          ? line("firecrawl", "Listing import (Firecrawl)", {
              configured: true,
              ok: true,
              detail: "Key set",
              fix: "",
            })
          : line("firecrawl", "Listing import (Firecrawl)", {
              configured: false,
              optional: true,
              fix: "Add FIRECRAWL_API_KEY in Secrets, then switch the listing_import routine on.",
            }))(),
    ];
    const lines = await Promise.all(
      checks.map((c, i) =>
        c.catch((e: unknown) =>
          line(`check-${i}`, "Check", {
            configured: true,
            ok: false,
            detail: why(e),
            fix: "Try again.",
          }),
        ),
      ),
    );
    return sortLines(lines);
  });
