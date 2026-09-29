import { createFileRoute } from "@tanstack/react-router";

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
 * Outbound calendar for one room. Only bookings entered in Latchkey are shared:
 * anything imported from a platform stays out, so two linked calendars can't
 * echo the same stay back and forth.
 */
export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "").replace(/\.ics$/i, "");
        if (token.length < 20) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: room } = await supabaseAdmin
          .from("rooms")
          .select("id, display_name, export_feed_enabled, properties(name)")
          .eq("feed_token", token)
          .maybeSingle();
        if (!room || !room.export_feed_enabled) return new Response("Not found", { status: 404 });

        const { data: rows } = await supabaseAdmin
          .from("bookings")
          .select("id, check_in_date, check_out_date, status, channel, mirror_of, guest_full_name")
          .eq("room_id", room.id)
          .is("mirror_of", null)
          .in("channel", ["direct", "other"])
          .in("status", ["upcoming", "checked_in", "checked_out", "blocked", "needs_details"]);

        const now = stamp(new Date());
        const lines = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//Latchkey//EN",
          "CALSCALE:GREGORIAN",
          `X-WR-CALNAME:${esc(`${(room as any).properties?.name ?? "Latchkey"} · ${room.display_name}`)}`,
        ];
        for (const b of rows ?? []) {
          lines.push(
            "BEGIN:VEVENT",
            `UID:latchkey-${b.id}@latchkey`,
            `DTSTAMP:${now}`,
            `DTSTART;VALUE=DATE:${dateOnly(b.check_in_date)}`,
            `DTEND;VALUE=DATE:${dateOnly(b.check_out_date)}`,
            `SUMMARY:${esc(b.status === "blocked" ? "Not available" : "Booked")}`,
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
