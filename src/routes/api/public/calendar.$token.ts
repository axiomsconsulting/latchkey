/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
import { createFileRoute } from "@tanstack/react-router";
import { rebrand } from "@/lib/brand";
import { feedBookings, feedSummary, type FeedBooking, type FeedView } from "@/lib/calendar-feed";

/** Escape text for an iCalendar property value. */
function esc(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function stamp(d: Date) {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function dateOnly(d: string) {
  return d.replace(/-/g, "");
}

/**
 * Outbound calendar for one room: what's entered in Latchkey (for booking sites),
 * or every stay with ?view=all (for the host's own calendar). See calendar-feed.ts.
 */
export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const view: FeedView =
          new URL(request.url).searchParams.get("view") === "all" ? "all" : "direct";
        const token = String(params.token ?? "").replace(/\.ics$/i, "");
        if (token.length < 20) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: room } = await supabaseAdmin
          .from("rooms")
          .select("id, property_id, display_name, export_feed_enabled, properties(name)")
          .eq("feed_token", token)
          .maybeSingle();
        if (!room || !room.export_feed_enabled) return new Response("Not found", { status: 404 });

        const { data: rows } = await supabaseAdmin
          .from("bookings")
          .select(
            "id, check_in_date, check_out_date, status, channel, site_key, mirror_of, connection_id",
          )
          .eq("room_id", room.id);
        const { resolveSites, platformKey } = await import("@/lib/booking-sites");
        const { platformSites } = await import("@/lib/booking-sites.server");
        const { guest: guestCopy } = await import("@/content/copy");
        const platformLabels = guestCopy.platforms as Record<string, string>;
        const { data: host } = await (supabaseAdmin as any)
          .from("properties")
          .select("hosts(booking_sites)")
          .eq("id", (room as any).property_id)
          .maybeSingle();
        const sites = resolveSites(
          host?.hosts?.booking_sites,
          await platformSites(),
          platformLabels,
        );
        const siteLabel = (b: FeedBooking) =>
          sites.find((x: { key: string }) => x.key === platformKey(b as never))?.label ?? b.channel;

        const now = stamp(new Date());
        const lines = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          rebrand("PRODID:-//Latchkey//EN"),
          "CALSCALE:GREGORIAN",
          `X-WR-CALNAME:${esc(`${(room as any).properties?.name ?? rebrand("Latchkey")} · ${room.display_name}`)}`,
        ];
        for (const b of feedBookings((rows ?? []) as FeedBooking[], view)) {
          lines.push(
            "BEGIN:VEVENT",
            `UID:latchkey-${b.id}@latchkey`,
            `DTSTAMP:${now}`,
            `DTSTART;VALUE=DATE:${dateOnly(b.check_in_date)}`,
            `DTEND;VALUE=DATE:${dateOnly(b.check_out_date)}`,
            `SUMMARY:${esc(feedSummary(b, view, siteLabel))}`,
            "END:VEVENT",
          );
        }
        lines.push("END:VCALENDAR");

        return new Response(`${lines.join("\r\n")}\r\n`, {
          headers: {
            "content-type": "text/calendar; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
