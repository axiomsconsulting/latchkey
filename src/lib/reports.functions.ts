/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Operations reports (src/lib/reports.ts) for the business being viewed:
 * one property or all of them, over a date range. Read with the person's own
 * access (RLS) and always limited to this business's properties.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { channels } from "@/content/copy";
import { platformKey, resolveSites } from "./booking-sites";
import { addDays } from "./dates";
import {
  buildReport,
  type ReportJob,
  type ReportMessage,
  type ReportReadiness,
  type ReportRequest,
  type ReportStay,
} from "./reports";

type Loose = { from: (t: string) => any };
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getOperationsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: z.string().uuid(),
        propertyId: z.string().uuid().nullable(),
        from: isoDay,
        to: isoDay,
      })
      .refine(
        (x) => x.from < x.to && Date.parse(x.to) - Date.parse(x.from) <= 366 * 86_400_000,
        "Pick up to a year.",
      )
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Loose;
    const [{ data: host }, { data: props }] = await Promise.all([
      sb
        .from("hosts")
        .select("currency, channel_labels, booking_sites")
        .eq("id", data.hostId)
        .maybeSingle(),
      sb.from("properties").select("id, timezone").eq("host_id", data.hostId),
    ]);
    const all = (props ?? []) as Array<{ id: string; timezone: string | null }>;
    const chosen = data.propertyId ? all.filter((p) => p.id === data.propertyId) : all;
    if (!host || !chosen.length) throw new Error("Nothing to report on yet.");
    const ids = chosen.map((p) => p.id);
    const tz = chosen[0]!.timezone ?? "Europe/London";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const toTs = `${data.to}T00:00:00Z`;
    const earlier = `${addDays(data.from, -60)}T00:00:00Z`;

    const [{ count: rooms }, { data: stays }, { data: jobs }, { data: requests }, readiness] =
      await Promise.all([
        sb
          .from("rooms")
          .select("id", { count: "exact", head: true })
          .in("property_id", ids)
          .neq("active", false),
        sb
          .from("bookings")
          .select(
            "id, room_id, check_in_date, check_out_date, status, channel, site_key, guest_count, checked_in_at",
          )
          .in("property_id", ids)
          .is("mirror_of", null)
          .lt("check_in_date", data.to)
          .gte("check_out_date", data.from)
          .limit(5000),
        sb
          .from("service_jobs")
          .select("source, status, created_at, acknowledged_at, completed_at")
          .eq("host_id", data.hostId)
          .in("property_id", ids)
          .lt("created_at", toTs)
          .or(`completed_at.is.null,completed_at.gte.${data.from}`)
          .limit(5000),
        sb
          .from("requests")
          .select("status, total_pence, paid_at, created_at, bookings!inner(property_id)")
          .in("bookings.property_id", ids)
          .gte("created_at", earlier)
          .lt("created_at", toTs)
          .limit(5000),
        sb
          .from("room_readiness")
          .select("room_id, day, status")
          .in("property_id", ids)
          .gte("day", data.from)
          .lt("day", data.to),
      ]);
    const stayRows: ReportStay[] = (
      (stays ?? []) as Array<ReportStay & { channel: string; site_key: string | null }>
    ).map((s) => ({
      id: s.id,
      room_id: s.room_id,
      check_in_date: s.check_in_date,
      check_out_date: s.check_out_date,
      status: s.status,
      site: platformKey(s),
      guest_count: s.guest_count,
      checked_in_at: s.checked_in_at,
    }));
    // Messages with guests on these stays: how fast they got an answer.
    const messages: ReportMessage[] = [];
    const stayIds = stayRows.map((s) => s.id);
    for (let i = 0; i < stayIds.length && i < 2000; i += 200) {
      const { data: m } = await sb
        .from("messages")
        .select("booking_id, direction, created_at")
        .in("booking_id", stayIds.slice(i, i + 200))
        .in("channel", ["stay_page", "platform"])
        .gte("created_at", earlier)
        .lt("created_at", toTs);
      messages.push(...((m ?? []) as ReportMessage[]));
    }
    const sites = resolveSites(
      host.channel_labels as Record<string, string> | null,
      host.booking_sites,
      channels as unknown as Record<string, string>,
    );
    return {
      today,
      currency: (host.currency as string | null) ?? "GBP",
      siteLabels: Object.fromEntries(sites.map((s) => [s.key, s.label])) as Record<string, string>,
      // Before migration 0042 there's no board, so "ready on arrival" has nothing to count.
      hasReadiness: !readiness.error,
      report: buildReport({
        range: { from: data.from, to: data.to },
        today,
        rooms: rooms ?? 0,
        stays: stayRows,
        jobs: (jobs ?? []) as ReportJob[],
        requests: ((requests ?? []) as Array<ReportRequest>).map((r) => ({
          status: r.status,
          total_pence: r.total_pence ?? 0,
          paid_at: r.paid_at,
          created_at: r.created_at,
        })),
        messages,
        readiness: (readiness.error ? [] : (readiness.data ?? [])) as ReportReadiness[],
      }),
    };
  });
