/**
 * The business's own data for the dashboard search (src/lib/omni-search.ts).
 * Every query is limited to the business being viewed: its own properties'
 * rows, read with the signed-in person's access (RLS), so another host's
 * guests, guide text or items never appear, even for a super admin, who can
 * read every business. Removed data never appears: hidden stays, mirror
 * entries, cleared guest details, removed guide sections, deleted extras,
 * inactive rooms and calendar links.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanQuery, stayLine, type SearchHit } from "./omni-search";

type Loose = { from: (t: string) => any };
const LIMIT = 6;

export const omniSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: z.string().uuid(), q: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<{ hits: SearchHit[] }> => {
    const q = cleanQuery(data.q);
    if (q.length < 2) return { hits: [] };
    const sb = context.supabase as unknown as Loose;
    // Only this business's properties, and only if the person may read them.
    const { data: props } = await sb.from("properties").select("id, name, short_code").eq("host_id", data.hostId);
    const properties = (props ?? []) as Array<{ id: string; name: string; short_code: string | null }>;
    if (!properties.length) return { hits: [] };
    const ids = properties.map((p) => p.id);
    const nameOf = new Map(properties.map((p) => [p.id, p.name]));
    // Commas and brackets were removed by cleanQuery, so the text is safe inside or().
    const like = `%${q.replace(/ /g, "%")}%`;
    const or = (cols: string[]) => cols.map((c) => `${c}.ilike.${like}`).join(",");
    const safe = async <T,>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
      try {
        const r = await p;
        return r.error ? [] : (r.data ?? []);
      } catch {
        return [];
      }
    };

    const [stays, rooms, guides, steps, extras, jobs, trades, links, looks] = await Promise.all([
      safe<{ id: string; guest_full_name: string | null; reservation_code: string | null; check_in_date: string; check_out_date: string; status: string; property_id: string }>(
        sb
          .from("bookings")
          .select("id, guest_full_name, reservation_code, check_in_date, check_out_date, status, property_id")
          .in("property_id", ids)
          .is("archived_at", null)
          .is("mirror_of", null)
          .is("anonymised_at", null)
          .or(or(["guest_full_name", "reservation_code", "guest_email"]))
          .order("check_in_date", { ascending: false })
          .limit(LIMIT),
      ),
      safe<{ id: string; display_name: string; public_title: string | null; property_id: string }>(
        sb.from("rooms").select("id, display_name, public_title, property_id").in("property_id", ids).neq("active", false).or(or(["display_name", "public_title"])).limit(LIMIT),
      ),
      safe<{ section_key: string; room_id: string | null; title: string | null; summary: string | null; property_id: string }>(
        sb.from("guides").select("section_key, room_id, title, summary, property_id").in("property_id", ids).neq("published", false).or(or(["title", "summary"])).limit(LIMIT),
      ),
      safe<{ heading: string | null; body: string | null; guides: { section_key: string; room_id: string | null; property_id: string; published: boolean | null; title: string | null } }>(
        sb
          .from("guide_steps")
          .select("heading, body, guides!inner(section_key, room_id, property_id, published, title)")
          .in("guides.property_id", ids)
          .or(or(["heading", "body"]))
          .limit(LIMIT),
      ),
      safe<{ id: string; name: string; description: string | null; property_id: string }>(
        sb.from("extras_catalogue").select("id, name, description, property_id").in("property_id", ids).is("deleted_at", null).or(or(["name", "description"])).limit(LIMIT),
      ),
      safe<{ id: string; title: string; status: string; property_id: string | null }>(
        sb.from("service_jobs").select("id, title, status, property_id").eq("host_id", data.hostId).or(or(["title", "note"])).order("created_at", { ascending: false }).limit(LIMIT),
      ),
      safe<{ id: string; name: string; company_name: string | null; category: string | null }>(
        sb.from("trades").select("id, name, company_name, category").eq("host_id", data.hostId).or(or(["name", "company_name", "category"])).limit(LIMIT),
      ),
      safe<{ id: string; listing_name: string | null; channel: string; property_id: string }>(
        sb.from("channel_connections").select("id, listing_name, channel, property_id").in("property_id", ids).neq("is_active", false).ilike("listing_name", like).limit(LIMIT),
      ),
      safe<{ id: string; name: string; host_id: string | null }>(
        sb.from("theme_templates").select("id, name, host_id").or(`host_id.eq.${data.hostId},host_id.is.null`).ilike("name", like).limit(LIMIT),
      ),
    ]);

    const word = q.toLowerCase().split(" ")[0]!;
    const hits: SearchHit[] = [];
    for (const p of properties) {
      if (`${p.name} ${p.short_code ?? ""}`.toLowerCase().includes(word)) hits.push({ kind: "property", id: p.id, title: p.name, subtitle: p.short_code ? `/${p.short_code}` : undefined, href: "/app/properties?focus=property", propertyId: p.id } as SearchHit);
    }
    for (const b of stays) {
      hits.push({
        kind: "guest",
        id: b.id,
        title: b.guest_full_name || b.reservation_code || "Stay",
        subtitle: `${stayLine(b.check_in_date, b.check_out_date)} · ${nameOf.get(b.property_id) ?? ""}${b.status === "cancelled" ? " · cancelled" : ""}`,
        href: `/app/bookings?guest=${b.id}`,
        propertyId: b.property_id,
      });
    }
    for (const r of rooms) hits.push({ kind: "room", id: r.id, title: r.public_title || r.display_name, subtitle: nameOf.get(r.property_id) ?? "", href: "/app/properties?focus=rooms", propertyId: r.property_id });
    const guideHref = (key: string, room: string | null) => `/app/guides?section=${encodeURIComponent(key)}${room ? `&room=${room}` : ""}`;
    const seen = new Set<string>();
    for (const g of guides) {
      const k = `${g.property_id}:${g.room_id}:${g.section_key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      hits.push({ kind: "guide", id: k, title: g.title || g.section_key, subtitle: (g.summary ?? "").slice(0, 80), href: guideHref(g.section_key, g.room_id), propertyId: g.property_id });
    }
    for (const s of steps) {
      const g = s.guides;
      if (!g || g.published === false) continue;
      const k = `${g.property_id}:${g.room_id}:${g.section_key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      hits.push({ kind: "guide", id: k, title: s.heading || g.title || g.section_key, subtitle: (s.body ?? "").slice(0, 80), href: guideHref(g.section_key, g.room_id), propertyId: g.property_id });
    }
    for (const x of extras) hits.push({ kind: "extra", id: x.id, title: x.name, subtitle: nameOf.get(x.property_id) ?? "", href: "/app/settings?focus=extras", propertyId: x.property_id });
    for (const j of jobs) hits.push({ kind: "job", id: j.id, title: j.title, subtitle: j.status.replace(/_/g, " "), href: `/app/services?job=${j.id}`, ...(j.property_id ? { propertyId: j.property_id } : {}) });
    for (const t of trades) hits.push({ kind: "trade", id: t.id, title: t.name, subtitle: [t.company_name, t.category].filter(Boolean).join(" · "), href: "/app/services?tab=trades" });
    for (const l of links) hits.push({ kind: "connection", id: l.id, title: l.listing_name || l.channel, subtitle: `${l.channel} · ${nameOf.get(l.property_id) ?? ""}`, href: `/app/connections?link=${l.id}`, propertyId: l.property_id });
    for (const t of looks) hits.push({ kind: "look", id: t.id, title: t.name, subtitle: t.host_id ? "Your saved look" : "Shared look", href: "/app/settings?focus=theme" });
    return { hits: hits.map((h) => (h.subtitle === undefined ? (({ subtitle: _s, ...rest }) => rest)(h) : h)) };
  });
