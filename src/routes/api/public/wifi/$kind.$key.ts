import { createFileRoute } from "@tanstack/react-router";

/**
 * "Join Wi-Fi" on an iPhone or iPad: an Apple configuration profile for the
 * network a guest page shows, by room QR code (/api/public/wifi/room/<code>)
 * or stay link (/api/public/wifi/stay/<token>). Same rules as the page: the
 * room's own network first, and nothing while the host keeps the password
 * until check-in.
 */
export const Route = createFileRoute("/api/public/wifi/$kind/$key")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const none = () => new Response("Wi-Fi details aren't available from this link.", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as unknown as { from: (t: string) => any };
        const { guestWifi } = await import("@/lib/stay-access.server");
        let wifi: Awaited<ReturnType<typeof guestWifi>> = null;
        let org = "";
        if (params.kind === "room" && /^[a-z0-9]{8,24}$/.test(params.key)) {
          const { data: room } = await db.from("rooms").select("id, property_id, active").eq("guide_code", params.key).maybeSingle();
          if (!room || room.active === false) return none();
          const { data: p } = await db.from("properties").select("id, name, wifi_name, wifi_password").eq("id", room.property_id).maybeSingle();
          if (!p) return none();
          org = p.name;
          wifi = await guestWifi(db, p, room.id, false);
        } else if (params.kind === "stay" && params.key.length >= 20 && params.key.length <= 80) {
          const { sha256 } = await import("@/lib/checkin.server");
          const { data: t } = await db.from("stay_tokens").select("booking_id, expires_at").eq("token_hash", sha256(params.key)).maybeSingle();
          if (!t || Date.parse(t.expires_at) < Date.now()) return none();
          const { data: b } = await db.from("bookings").select("property_id, room_id, status").eq("id", t.booking_id).maybeSingle();
          if (!b || b.status === "cancelled") return none();
          const { data: p } = await db.from("properties").select("id, name, wifi_name, wifi_password").eq("id", b.property_id).maybeSingle();
          if (!p) return none();
          org = p.name;
          wifi = await guestWifi(db, p, b.room_id, b.status === "checked_in" || b.status === "checked_out");
        } else return none();
        if (!wifi || wifi.locked) return none();
        const { wifiProfile } = await import("@/lib/stay-access");
        const body = wifiProfile(wifi.name, wifi.password, org, () => crypto.randomUUID().toUpperCase());
        return new Response(body, {
          headers: {
            "content-type": "application/x-apple-aspen-config",
            "content-disposition": `attachment; filename="wifi.mobileconfig"`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
