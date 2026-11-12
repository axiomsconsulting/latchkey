/* eslint-disable @typescript-eslint/no-explicit-any -- columns from migrations 0109 and 0110 */
/**
 * Server only: the AI receptionist (rules in receptionist.ts). Gathers what it may know for a
 * property and, when there is one, the guest's stay (the guide without door details, property
 * information, around here, the way to their room, extras, times, Wi-Fi), asks the model for a
 * short answer, and speaks it in the studio voice when Latchkey has one.
 */
import {
  ASKS_PER_MINUTE,
  briefFor,
  normaliseReceptionist,
  openKeys,
  readAnswer,
  trimHistory,
  type Knowledge,
  type Receptionist,
  type Surface,
} from "./receptionist";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

async function db(): Promise<any> {
  const { admin } = await import("./checkin.server");
  return admin();
}

/** Pro (or comped, or a plan with the feature), and Latchkey admin's switch is on. */
export async function receptionistAllowed(hostId: string): Promise<boolean> {
  const { jobAllowed } = await import("./usage.server");
  if (!(await jobAllowed("ai_receptionist"))) return false;
  const sb = await db();
  const [{ data: host }, { data: site }] = await Promise.all([
    sb.from("hosts").select("plan_key, subscription_status").eq("id", hostId).maybeSingle(),
    sb.from("site_settings").select("pricing_model").eq("id", 1).maybeSingle(),
  ]);
  if (host?.subscription_status === "comped" || host?.plan_key === "pro") return true;
  if (!site?.pricing_model) return false;
  const { normaliseModel, planFor } = await import("./pricing-model");
  return planFor(normaliseModel(site.pricing_model), host?.plan_key).features.includes(
    "ai_receptionist",
  );
}

/** The property's receptionist settings (off before migration 0110). */
export async function settingsFor(sb: any, propertyId: string): Promise<Receptionist> {
  const { data, error } = await sb
    .from("properties")
    .select("receptionist")
    .eq("id", propertyId)
    .maybeSingle();
  return normaliseReceptionist(error ? null : data?.receptionist);
}

const asks = new Map<string, number[]>();
/** At most ASKS_PER_MINUTE questions a minute from one stay, room or tablet. */
export function underLimit(key: string): boolean {
  const now = Date.now();
  const recent = (asks.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= ASKS_PER_MINUTE) return false;
  recent.push(now);
  asks.set(key, recent);
  if (asks.size > 5000) asks.clear();
  return true;
}

/** Everything the receptionist may know, for a property and (optionally) one stay. */
export async function knowledgeFor(
  propertyId: string,
  stay: { bookingId: string } | null,
): Promise<Knowledge & { hostId: string }> {
  const sb = await db();
  const { data: p } = await sb
    .from("properties")
    .select(
      "id, host_id, name, timezone, default_check_in_time, default_check_out_time, quiet_hours_start, quiet_hours_end, wifi_name, wifi_password, parking_notes, property_info",
    )
    .eq("id", propertyId)
    .maybeSingle();
  if (!p) throw new Error("Property not found.");
  let b: any = null;
  if (stay) {
    const { data } = await sb
      .from("bookings")
      .select(
        "id, room_id, guest_full_name, status, check_in_date, check_out_date, check_in_time, check_out_time, rooms(display_name, public_title)",
      )
      .eq("id", stay.bookingId)
      .eq("property_id", propertyId)
      .maybeSingle();
    b = data;
  }
  const roomId: string | null = b?.room_id ?? null;
  const roomName: string | null = b?.rooms ? b.rooms.public_title || b.rooms.display_name : null;

  // The guide: house rows overridden by the room's own, published, never the door section.
  const { DOOR_SECTIONS } = await import("./guide");
  const { plainText } = await import("./rich-text");
  const { data: guides } = await sb
    .from("guides")
    .select(
      "id, room_id, section_key, title, summary, published, guide_steps(heading, body, sort_order)",
    )
    .eq("property_id", propertyId);
  const bySection = new Map<string, any>();
  for (const g of (guides ?? []) as any[]) {
    if (g.published === false || DOOR_SECTIONS.includes(g.section_key)) continue;
    if (g.room_id && g.room_id !== roomId) continue;
    const cur = bySection.get(g.section_key);
    if (!cur || (g.room_id && !cur.room_id)) bySection.set(g.section_key, g);
  }
  const guide = [...bySection.values()].map((g) => ({
    key: g.section_key as string,
    title: (g.title as string | null) || String(g.section_key).replace(/_/g, " "),
    text: [
      plainText(g.summary),
      ...((g.guide_steps ?? []) as any[])
        .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
        .map((st) => [st.heading, plainText(st.body)].filter(Boolean).join(": ")),
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 1500),
  }));

  // Property information, around here and the way to the room.
  const { normalisePropertyInfo, infoText } = await import("./property-info");
  const info = infoText(normalisePropertyInfo(p.property_info));
  const { data: lp } = await sb
    .from("local_places")
    .select("places, events")
    .eq("property_id", propertyId)
    .maybeSingle();
  const { localText } = await import("./local-guide");
  const local = lp ? localText((lp.places ?? []) as any[], (lp.events ?? []) as any[]) : "";
  let directions: string[] | null = null;
  const { plansFor } = await import("./guest-extras.server");
  const { directionsTo, mapFloors } = await import("./floor-plans");
  const { houseNotes, houseText } = await import("./floor-map");
  const plans = await plansFor(sb, propertyId);
  const house = houseText(houseNotes(mapFloors(plans)));
  if (roomId && roomName) {
    const d = directionsTo(plans, roomId, roomName);
    directions = d ? [...d.steps, ...(d.heating ?? [])] : null;
  }

  // Wi-Fi as the stay guide would show it (the password only once checked in when the host says so).
  let wifi: Knowledge["wifi"] = null;
  if (stay) {
    const { guestWifi } = await import("./stay-access.server");
    const w = await guestWifi(
      sb,
      p,
      roomId,
      b?.status === "checked_in" || b?.status === "checked_out",
    );
    wifi = w ? { name: w.name, password: w.password } : null;
  } else if (p.wifi_name) wifi = { name: p.wifi_name, password: null };

  const { data: extras } = await sb
    .from("extras_catalogue")
    .select("name, price_pence, currency, is_free, active, deleted_at")
    .eq("property_id", propertyId)
    .eq("active", true)
    .is("deleted_at", null)
    .limit(30);
  const { money } = await import("./direct-rates");
  const extrasText = ((extras ?? []) as any[])
    .map(
      (x) =>
        `${x.name}${x.is_free ? " (free)" : x.price_pence ? ` (${money(x.price_pence, x.currency ?? "GBP")})` : ""}`,
    )
    .join(", ");

  const inT =
    (b?.check_in_time as string | null)?.slice(0, 5) ||
    (p.default_check_in_time as string | null)?.slice(0, 5);
  const outT =
    (b?.check_out_time as string | null)?.slice(0, 5) ||
    (p.default_check_out_time as string | null)?.slice(0, 5);
  const times = [
    inT ? `check-in from ${inT}` : "",
    outT ? `check-out by ${outT}` : "",
    b ? `stay ${b.check_in_date} to ${b.check_out_date}` : "",
    p.quiet_hours_start && p.quiet_hours_end
      ? `quiet hours ${String(p.quiet_hours_start).slice(0, 5)} to ${String(p.quiet_hours_end).slice(0, 5)}`
      : "",
    p.parking_notes ? `parking: ${p.parking_notes}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  return {
    hostId: p.host_id,
    property: p.name,
    guestName: b?.guest_full_name
      ? (String(b.guest_full_name).trim().split(/\s+/)[0] ?? null)
      : null,
    room: roomName,
    times,
    wifi,
    directions,
    house: house || null,
    rules: guide.find((g) => g.key === "rules")?.text ?? null,
    info: info || null,
    guide,
    local: local || null,
    extras: extrasText || null,
    checkout:
      [outT ? `by ${outT}` : "", guide.find((g) => g.key === "checkout")?.text ?? ""]
        .filter(Boolean)
        .join(". ") || null,
  };
}

/** Asks the model for the answer (JSON: reply, open). */
export async function askModel(
  k: Knowledge,
  s: Receptionist,
  surface: Surface,
  question: string,
  history: Array<{ role: "guest" | "receptionist"; text: string }>,
): Promise<{ reply: string; open: string | null }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("The receptionist isn't set up yet.");
  const allowed = openKeys(k);
  const turns = trimHistory(history).map((h) => ({
    role: h.role === "guest" ? "user" : "assistant",
    content: [{ type: h.role === "guest" ? "input_text" : "output_text", text: h.text }],
  }));
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      instructions: briefFor(k, s, surface),
      input: [
        ...turns,
        { role: "user", content: [{ type: "input_text", text: question.slice(0, 600) }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "answer",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reply: { type: "string" },
              open: { type: ["string", "null"], enum: [...allowed, null] },
            },
            required: ["reply", "open"],
          },
        },
      },
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(
      res.status === 402
        ? "The receptionist is resting just now."
        : "Sorry, I couldn't answer that just now.",
    );
  }
  const { readAiStream } = await import("./ai-stream");
  try {
    return readAnswer(JSON.parse(await readAiStream(res.body)), allowed);
  } catch {
    return readAnswer(null, allowed);
  }
}
