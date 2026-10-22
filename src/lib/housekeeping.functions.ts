/**
 * The housekeeping and readiness board (src/lib/housekeeping.ts): read a
 * property's rooms for a day, and record where each room's cleaning has got
 * to (room_readiness, migration 0042). Owners, managers and cleaners can
 * update it; everything is read with the person's own access (RLS).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays } from "./dates";
import { READINESS, type BoardStay, type ReadinessRow, type ScheduleWindow } from "./housekeeping";

type Loose = { from: (t: string) => any };
const uuid = z.string().uuid();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const DONE = "(done,declined,cancelled)";

export const getHousekeepingBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid, day: isoDay.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const { data: p } = await sb.from("properties").select("id, host_id, name, timezone, default_check_in_time, default_check_out_time, quiet_hours_start, quiet_hours_end").eq("id", data.propertyId).maybeSingle();
    if (!p) throw new Error("Property not found.");
    const tz = (p.timezone as string | null) ?? "Europe/London";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const day = data.day ?? today;
    const [{ data: rooms }, { data: stays }, readiness, { data: jobs }, { data: trades }, { data: windows }] = await Promise.all([
      sb.from("rooms").select("id, display_name, sort_order").eq("property_id", p.id).neq("active", false).order("sort_order"),
      sb
        .from("bookings")
        .select("id, room_id, guest_full_name, check_in_date, check_out_date, check_in_time, check_out_time, status, guest_count")
        .eq("property_id", p.id)
        .is("mirror_of", null)
        .lte("check_in_date", day)
        .gte("check_out_date", day),
      sb.from("room_readiness").select("room_id, status, assignee, due_time, note, updated_at, updated_by_name").eq("property_id", p.id).eq("day", day),
      sb.from("service_jobs").select("room_id").eq("property_id", p.id).not("room_id", "is", null).not("status", "in", DONE).is("archived_at", null),
      sb.from("trades").select("name, category").eq("host_id", p.host_id).limit(50),
      // The cleaning and unavailable times, weekly and one-off: the board's timeline and schedule.
      sb.from("unavailability_windows").select("id, room_id, day_of_week, start_time, end_time, starts_at, ends_at, reason").eq("property_id", p.id),
    ]);
    const openJobs: Record<string, number> = {};
    for (const j of (jobs ?? []) as Array<{ room_id: string }>) openJobs[j.room_id] = (openJobs[j.room_id] ?? 0) + 1;
    // People to assign: the team's names and the host's own tradespeople (cleaners first).
    let team: string[] = [];
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as Loose;
      const { data: members } = await admin.from("host_members").select("user_id").eq("host_id", p.host_id);
      const ids = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
      const { data: profiles } = ids.length ? await admin.from("user_profiles").select("user_id, display_name").in("user_id", ids) : { data: [] };
      team = ((profiles ?? []) as Array<{ display_name: string | null }>).map((x) => x.display_name).filter((x): x is string => !!x);
    } catch {
      // Names are only suggestions: the board works without them.
    }
    const tradeNames = ((trades ?? []) as Array<{ name: string; category: string | null }>)
      .sort((a, b) => Number(b.category === "cleaning") - Number(a.category === "cleaning"))
      .map((t) => t.name);
    return {
      // Before migration 0042 the board shows what the bookings say, and can't save yet.
      available: !readiness.error,
      propertyName: p.name as string,
      day,
      today,
      prevDay: addDays(day, -1),
      nextDay: addDays(day, 1),
      defaultCheckIn: ((p.default_check_in_time as string | null) ?? "15:00").slice(0, 5),
      defaultCheckOut: ((p.default_check_out_time as string | null) ?? "11:00").slice(0, 5),
      quietStart: ((p.quiet_hours_start as string | null) ?? "22:00").slice(0, 5),
      quietEnd: ((p.quiet_hours_end as string | null) ?? "07:00").slice(0, 5),
      timezone: tz,
      windows: (windows ?? []) as ScheduleWindow[],
      rooms: (rooms ?? []) as Array<{ id: string; display_name: string }>,
      stays: (stays ?? []) as BoardStay[],
      readiness: (readiness.error ? [] : (readiness.data ?? [])) as ReadinessRow[],
      openJobs,
      people: [...new Set([...team, ...tradeNames])].slice(0, 40),
    };
  });

export const setRoomReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        roomId: uuid,
        day: isoDay,
        status: z.enum(READINESS),
        assignee: z.string().max(80).nullable().optional(),
        dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // The shared demo can use the board too: it resets every day.
    const sb = context.supabase as unknown as Loose;
    const uid = (context.claims as { sub?: string }).sub ?? null;
    const email = (context.claims as { email?: string }).email ?? null;
    let name: string | null = null;
    if (uid) {
      const { data: prof } = await sb.from("user_profiles").select("display_name").eq("user_id", uid).maybeSingle();
      name = (prof?.display_name as string | null) ?? email;
    }
    const row = {
      property_id: data.propertyId,
      room_id: data.roomId,
      day: data.day,
      status: data.status,
      ...(data.assignee !== undefined ? { assignee: data.assignee?.trim() || null } : {}),
      ...(data.dueTime !== undefined ? { due_time: data.dueTime } : {}),
      ...(data.note !== undefined ? { note: data.note?.trim() || null } : {}),
      updated_by: uid,
      updated_by_name: name,
      updated_at: new Date().toISOString(),
    };
    // RLS decides: owners, managers and cleaners of this property's business.
    const { error } = await sb.from("room_readiness").upsert(row, { onConflict: "room_id,day" });
    if (error) throw new Error(/permission|policy/i.test(error.message) ? "You can't update this board." : error.message);
    return { ok: true };
  });
