/**
 * Server-only calendar sync. Raw feed URLs live in connection_secrets and are
 * never returned to the browser.
 */

import { mapEventsToBookings, parseIcs, type Channel } from "./ical";
import { bookingsToCancel, buildPatch, detectRoomClashes, type ExistingBooking } from "./sync-logic";
import { todayInZone } from "./dates";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

export class FeedError extends Error {}

/** Rejects anything that is not a plain public HTTPS calendar URL. */
export function assertSafeFeedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FeedError("That does not look like a web address.");
  }
  if (url.protocol !== "https:") {
    throw new FeedError("Calendar links must start with https://");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    PRIVATE_V4.test(host) ||
    host === "[::1]" ||
    host.startsWith("[fe80:") ||
    host.startsWith("[fc") ||
    host.startsWith("[fd")
  ) {
    throw new FeedError("That address is not reachable from the internet.");
  }
  return url;
}

export async function fetchFeed(rawUrl: string): Promise<string> {
  const url = assertSafeFeedUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.5" },
    });
    if (!res.ok) {
      throw new FeedError(`The calendar provider replied with an error (${res.status}).`);
    }
    const text = await res.text();
    if (text.length > MAX_BYTES) {
      throw new FeedError("That calendar file is too large to read.");
    }
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      throw new FeedError("That link did not return a calendar file.");
    }
    return text;
  } catch (err) {
    if (err instanceof FeedError) throw err;
    if ((err as Error)?.name === "AbortError") {
      throw new FeedError("The calendar provider did not respond in time.");
    }
    throw new FeedError("We could not reach that calendar link.");
  } finally {
    clearTimeout(timer);
  }
}

export type SyncOutcome = {
  created: number;
  updated: number;
  cancelled: number;
  skipped: number;
  warnings: string[];
};

/** Fetches one connection's feed and reconciles it into bookings. */
export async function syncConnection(connectionId: string): Promise<SyncOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const startedAt = new Date().toISOString();

  const { data: conn, error: connErr } = await supabaseAdmin
    .from("channel_connections")
    .select("id, property_id, room_id, channel, listing_name, is_active")
    .eq("id", connectionId)
    .maybeSingle();
  if (connErr || !conn) throw new FeedError("That calendar connection no longer exists.");

  const { data: secret } = await supabaseAdmin
    .from("connection_secrets")
    .select("ical_url")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (!secret?.ical_url) throw new FeedError("This connection has no calendar link saved.");

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("id, timezone, default_check_in_time, default_check_out_time, host_id")
    .eq("id", conn.property_id)
    .maybeSingle();
  const timezone = property?.timezone ?? "Europe/London";
  const today = todayInZone(timezone);

  const warnings: string[] = [];
  let created = 0;
  let updated = 0;
  let cancelled = 0;

  try {
    const text = await fetchFeed(secret.ical_url);
    const events = parseIcs(text, timezone);
    const { bookings: incoming, skipped } = mapEventsToBookings(events, {
      channel: conn.channel as Channel,
      defaultCheckInTime: (property?.default_check_in_time ?? "15:00").slice(0, 5),
      defaultCheckOutTime: (property?.default_check_out_time ?? "11:00").slice(0, 5),
      listingTitle: conn.listing_name,
    });

    const { data: existingRows } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, external_uid, connection_id, room_id, status, check_in_date, check_out_date, manual_fields, guest_full_name, phone_last4, guest_count, check_in_time, check_out_time, reservation_code",
      )
      .eq("property_id", conn.property_id)
      .eq("channel", conn.channel);

    const existing = (existingRows ?? []) as unknown as ExistingBooking[];
    warnings.push(...detectRoomClashes(existing, incoming, conn.room_id));

    const byUid = new Map(existing.filter((b) => b.external_uid).map((b) => [b.external_uid!, b]));
    const seen = new Set<string>();

    for (const b of incoming) {
      seen.add(b.externalUid);
      const prior = byUid.get(b.externalUid);
      if (prior) {
        if (prior.room_id && conn.room_id && prior.room_id !== conn.room_id) continue;
        const patch = buildPatch(prior, b);
        const payload = { ...patch, last_synced_at: new Date().toISOString() };
        if (!prior.connection_id) Object.assign(payload, { connection_id: conn.id });
        await supabaseAdmin.from("bookings").update(payload).eq("id", prior.id);
        if (Object.keys(patch).length > 0) updated += 1;
      } else {
        const { error } = await supabaseAdmin.from("bookings").insert({
          property_id: conn.property_id,
          room_id: conn.room_id,
          connection_id: conn.id,
          source: "ical",
          channel: conn.channel,
          external_uid: b.externalUid,
          reservation_code: b.reservationCode,
          guest_full_name: b.guestFullName,
          guest_count: b.guestCount ?? 1,
          phone_last4: b.phoneLast4,
          check_in_date: b.checkInDate,
          check_out_date: b.checkOutDate,
          check_in_time: b.checkInTime,
          check_out_time: b.checkOutTime,
          status: b.status,
          last_synced_at: new Date().toISOString(),
        });
        if (error) warnings.push(error.message);
        else created += 1;
      }
    }

    const toCancel = bookingsToCancel(existing, seen, conn.id, today);
    if (toCancel.length > 0) {
      await supabaseAdmin.from("bookings").update({ status: "cancelled" }).in("id", toCancel);
      cancelled = toCancel.length;
    }

    const status = warnings.length > 0 ? "warning" : "ok";
    await supabaseAdmin.from("sync_runs").insert({
      connection_id: conn.id,
      status,
      created_count: created,
      updated_count: updated,
      cancelled_count: cancelled,
      skipped_count: skipped,
      warnings,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });
    await supabaseAdmin
      .from("channel_connections")
      .update({ last_synced_at: new Date().toISOString(), sync_status: status, last_error: null })
      .eq("id", conn.id);

    return { created, updated, cancelled, skipped, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    await supabaseAdmin.from("sync_runs").insert({
      connection_id: conn.id,
      status: "error",
      error_message: message,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });
    await supabaseAdmin
      .from("channel_connections")
      .update({ sync_status: "error", last_error: message })
      .eq("id", conn.id);
    throw err instanceof FeedError ? err : new FeedError(message);
  }
}

/** Runs every active connection. Used by the scheduled job. */
export async function syncAllConnections(): Promise<{ connections: number; errors: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("channel_connections")
    .select("id")
    .eq("is_active", true);
  let errors = 0;
  for (const row of data ?? []) {
    try {
      await syncConnection(row.id);
    } catch {
      errors += 1;
    }
  }
  return { connections: data?.length ?? 0, errors };
}

/**
 * Privacy retention: 90 days after check-out we drop the guest's name, phone
 * digits and notes, keeping the anonymised stay for statistics.
 */
export async function runRetentionSweep(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("bookings")
    .update({
      guest_full_name: null,
      phone_last4: null,
      notes: null,
      anonymised_at: new Date().toISOString(),
    })
    .lt("check_out_date", cutoff)
    .is("anonymised_at", null)
    .select("id");
  return data?.length ?? 0;
}
