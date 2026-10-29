/* eslint-disable @typescript-eslint/no-explicit-any -- reads a table the generated Supabase types don't cover yet */
/**
 * Short links to a guest's stay guide: /g/<three-words> (migration 0066),
 * made when check-in ends and shown on the door tablet beside the QR, so a
 * guest can photograph it or remember it instead of opening the guide on
 * the tablet. Opening one mints a fresh stay token for the stay's guide
 * window and goes to /stay/<token>; the words stop working at check-out.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { readRoomWords } from "@/lib/room-words";

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Wrong words per connection per hour, kept in memory: guessing a stay's words shouldn't be cheap.
const misses = new Map<string, number[]>();
function tooManyMisses(key: string): boolean {
  const now = Date.now();
  const recent = (misses.get(key) ?? []).filter((t) => now - t < 3_600_000);
  misses.set(key, recent);
  return recent.length >= 20;
}

/** /g/<words>: a fresh stay token for that stay, or null. */
export const openShortLink = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: z.string().max(60) }).parse(d))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { requestIp, hashIp } = await import("./ip-hash.server");
    const who = hashIp(requestIp(getRequest().headers)) ?? "unknown";
    if (tooManyMisses(who)) return { token: null };
    const code = readRoomWords(data.code);
    const db = await admin();
    const { data: link } = code
      ? await db
          .from("stay_short_links")
          .select("booking_id, expires_at")
          .eq("code", code)
          .maybeSingle()
      : { data: null };
    if (!link || Date.parse(link.expires_at) <= Date.now()) {
      misses.get(who)?.push(Date.now());
      await new Promise((r) => setTimeout(r, 400));
      return { token: null };
    }
    const { data: b } = await db
      .from("bookings")
      .select(
        "id, check_in_date, check_out_date, check_out_time, status, properties(timezone, default_check_out_time)",
      )
      .eq("id", link.booking_id)
      .maybeSingle();
    if (!b || b.status === "cancelled") return { token: null };
    const { guideWindow } = await import("./guide");
    const { newToken } = await import("./checkin.server");
    const win = guideWindow(
      b.check_in_date,
      b.check_out_date,
      (b.check_out_time ?? b.properties?.default_check_out_time ?? "11:00").slice(0, 5),
      b.properties?.timezone ?? "Europe/London",
    );
    const t = newToken();
    await db.from("stay_tokens").insert({
      token_hash: t.hash,
      booking_id: b.id,
      valid_from: win.validFrom.toISOString(),
      expires_at: win.expiresAt.toISOString(),
    });
    return { token: t.token };
  });
