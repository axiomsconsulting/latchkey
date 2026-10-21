/**
 * Server-only calendar sync. Raw feed URLs live in connection_secrets and are
 * never returned to the browser.
 */

import { mapEventsToBookings, parseIcs, type Channel } from "./ical";
import { bookingsToCancel, buildPatch, detectRoomClashes, shouldUnhide, type ExistingBooking } from "./sync-logic";
import { todayInZone } from "./dates";
import { reconcileRoom, type RoomBooking } from "./room-reconcile";

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
  let url = assertSafeFeedUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Follow redirects by hand so every hop is re-checked against the safety rules.
    let res: Response | null = null;
    for (let hop = 0; hop <= 3; hop++) {
      res = await fetch(url.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.5" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc || hop === 3) throw new FeedError("That calendar link redirects too many times.");
        url = assertSafeFeedUrl(new URL(loc, url).toString());
        continue;
      }
      break;
    }
    if (!res || !res.ok) {
      throw new FeedError(`The calendar provider replied with an error (${res?.status ?? 0}).`);
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
    // All columns: site_key arrives with migration 0021 and is optional until then.
    .select("*")
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

  // Shown as "Syncing…" on the Connections page. Its own update, so a
  // database without the column (before migration 0019) still syncs.
  const marker = supabaseAdmin as unknown as { from: (t: string) => any };
  const markSyncing = (on: boolean) =>
    marker.from("channel_connections").update({ sync_started_at: on ? new Date().toISOString() : null }).eq("id", connectionId);
  await markSyncing(true);

  try {
    const text = await fetchFeed(secret.ical_url);
    const events = parseIcs(text, timezone);
    const { bookings: incoming, skipped } = mapEventsToBookings(events, {
      channel: conn.channel as Channel,
      defaultCheckInTime: (property?.default_check_in_time ?? "15:00").slice(0, 5),
      defaultCheckOutTime: (property?.default_check_out_time ?? "11:00").slice(0, 5),
      listingTitle: conn.listing_name,
      today,
    });

    const cols =
      "id, external_uid, connection_id, room_id, status, check_in_date, check_out_date, manual_fields, guest_full_name, phone_last4, guest_count, check_in_time, check_out_time, reservation_code";
    const { withLegacy } = await import("./checkin.server");
    const { data: existingRows } = await withLegacy(
      () => supabaseAdmin.from("bookings").select(`${cols}, archived_at`).eq("property_id", conn.property_id).eq("channel", conn.channel),
      () => supabaseAdmin.from("bookings").select(cols).eq("property_id", conn.property_id).eq("channel", conn.channel),
    );

    const existing = (existingRows ?? []) as unknown as ExistingBooking[];
    warnings.push(...detectRoomClashes(existing, incoming, conn.room_id));

    const byUid = new Map(existing.filter((b) => b.external_uid).map((b) => [b.external_uid!, b]));
    const seen = new Set<string>();
    let unhidden = 0;

    for (const b of incoming) {
      seen.add(b.externalUid);
      const prior = byUid.get(b.externalUid);
      if (prior) {
        if (prior.room_id && conn.room_id && prior.room_id !== conn.room_id) continue;
        const patch = buildPatch(prior, b);
        const payload: Record<string, unknown> = {
          ...patch,
          last_synced_at: new Date().toISOString(),
          booking_url: b.bookingUrl ?? null,
          feed_status: b.feedStatus ?? null,
          listing_title: b.externalListingTitle,
        };
        if (!prior.connection_id) Object.assign(payload, { connection_id: conn.id });
        // Hidden stays stay hidden, unless the platform has changed them.
        if (shouldUnhide(prior, b)) {
          Object.assign(payload, { archived_at: null });
          unhidden += 1;
        }
        await supabaseAdmin.from("bookings").update(payload as never).eq("id", prior.id);
        if (Object.keys(patch).length > 0) updated += 1;
      } else {
        const { error } = await supabaseAdmin.from("bookings").insert({
          property_id: conn.property_id,
          room_id: conn.room_id,
          connection_id: conn.id,
          source: "ical",
          channel: conn.channel,
          ...(conn.site_key ? { site_key: conn.site_key } : {}),
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
          booking_url: b.bookingUrl ?? null,
          feed_status: b.feedStatus ?? null,
          listing_title: b.externalListingTitle,
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

    if (unhidden) warnings.push(`${unhidden} hidden ${unhidden === 1 ? "stay was" : "stays were"} shown again because the platform changed ${unhidden === 1 ? "it" : "them"}.`);
    if (conn.room_id) warnings.push(...(await reconcileRoomById(conn.room_id)));

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

    await markSyncing(false);
    return { created, updated, cancelled, skipped, warnings };
  } catch (err) {
    await markSyncing(false);
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

/**
 * Cross-checks every platform's entries for one room: links echoes to the real
 * booking and flags double-bookings. Returns warnings for the sync log.
 */
export async function reconcileRoomById(roomId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, channel, status, check_in_date, check_out_date, guest_full_name, reservation_code, mirror_of, manual_fields",
    )
    .eq("room_id", roomId)
    .neq("status", "cancelled");
  const rows = (data ?? []) as RoomBooking[];
  const changes = reconcileRoom(rows);
  for (const { id, ...patch } of changes) {
    await supabaseAdmin.from("bookings").update(patch as never).eq("id", id);
  }
  const flagged = changes.filter((c) => c.status === "flagged").length;
  return flagged > 0 ? [`Possible double-booking: ${flagged} stays overlap on this room.`] : [];
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
 * Privacy retention, per business (hosts.privacy, src/lib/privacy.ts): after
 * the chosen days (90 unless changed) we drop the guest's name, email, phone
 * digits and notes, keeping the anonymised stay for statistics; messages go
 * after their own chosen days, if any.
 */
export async function runRetentionSweep(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { normalisePrivacy, detailsCutoff, messagesCutoff } = await import("./privacy");
  const db = supabaseAdmin as unknown as { from: (t: string) => any };
  const today = new Date().toISOString().slice(0, 10);
  // Before migration 0041 there is no privacy column: everyone gets the defaults.
  let hostRows: Array<{ id: string; privacy?: unknown }> = [];
  {
    const withPrivacy = await db.from("hosts").select("id, privacy");
    hostRows = withPrivacy.error ? ((await db.from("hosts").select("id")).data ?? []) : (withPrivacy.data ?? []);
  }
  const { data: props } = await db.from("properties").select("id, host_id");
  const propsOf = new Map<string, string[]>();
  for (const p of (props ?? []) as Array<{ id: string; host_id: string }>) propsOf.set(p.host_id, [...(propsOf.get(p.host_id) ?? []), p.id]);
  // Group properties by cutoff, so each distinct choice is one update.
  const detailGroups = new Map<string, string[]>();
  const messageGroups = new Map<string, string[]>();
  for (const h of hostRows) {
    const ids = propsOf.get(h.id) ?? [];
    if (!ids.length) continue;
    const choice = normalisePrivacy(h.privacy);
    const d = detailsCutoff(today, choice);
    detailGroups.set(d, [...(detailGroups.get(d) ?? []), ...ids]);
    const m = messagesCutoff(today, choice);
    if (m) messageGroups.set(m, [...(messageGroups.get(m) ?? []), ...ids]);
  }
  const chunks = <T,>(xs: T[], n = 150) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
  let anonymised = 0;
  for (const [cutoff, ids] of detailGroups) {
    for (const part of chunks(ids)) {
      const { data } = await db
        .from("bookings")
        .update({ guest_full_name: null, guest_email: null, phone_last4: null, notes: null, anonymised_at: new Date().toISOString() })
        .in("property_id", part)
        .lt("check_out_date", cutoff)
        .is("anonymised_at", null)
        .select("id");
      anonymised += data?.length ?? 0;
    }
  }
  for (const [cutoff, ids] of messageGroups) {
    for (const part of chunks(ids)) {
      // A few thousand stays a run at most, so one run never times out.
      for (let round = 0; round < 10; round++) {
        const { data: stays } = await db.from("bookings").select("id, messages!inner(id)").in("property_id", part).lt("check_out_date", cutoff).limit(300);
        const stayIds = ((stays ?? []) as Array<{ id: string }>).map((b) => b.id);
        if (!stayIds.length) break;
        await db.from("messages").delete().in("booking_id", stayIds);
      }
    }
  }
  // Check-in privacy: results and attempts go 30 days after check-out.
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await supabaseAdmin.from("verification_results").delete().lt("delete_after", today);
  await purgeGuestIds(today);
  // The UK guest register is kept for 12 months from arrival, then removed.
  await supabaseAdmin.from("guest_register").delete().lt("keep_until", today);
  await supabaseAdmin.from("check_in_attempts").delete().lt("created_at", monthAgo);
  await supabaseAdmin.from("checkin_sessions").delete().lt("expires_at", new Date().toISOString());
  await supabaseAdmin.from("stay_tokens").delete().lt("expires_at", new Date().toISOString());
  // Direct enquiries go a year after they arrived (migration 0043; nothing to do before it).
  await db.from("direct_enquiries").delete().lt("created_at", new Date(Date.now() - 365 * 86_400_000).toISOString());
  // The team activity history is kept for a year.
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
  await (supabaseAdmin as unknown as { from: (t: string) => any }).from("audit_log").delete().lt("at", yearAgo);
  // Visitor analytics: 13 months, IP addresses cleared after 90 days.
  const { pruneAnalytics } = await import("./analytics.server");
  await pruneAnalytics();
  return anonymised;
}

/**
 * ID details and photos go on the day the host's chosen keep period ends,
 * a few hundred at a time so one run never times out.
 */
export async function purgeGuestIds(today: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { removeGuestPhotos } = await import("./checkin.server");
  for (let round = 0; round < 10; round++) {
    const { data } = await supabaseAdmin
      .from("guest_ids")
      .select("id, id_photo_path, face_photo_path")
      .lt("delete_after", today)
      .limit(300);
    if (!data?.length) return;
    await removeGuestPhotos(data.flatMap((r) => [r.id_photo_path, r.face_photo_path].filter((x): x is string => !!x)));
    await supabaseAdmin.from("guest_ids").delete().in("id", data.map((r) => r.id));
  }
}
