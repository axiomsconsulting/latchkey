/**
 * Today's weather for a stay guide (src/lib/weather.ts): where the property
 * is (its door tablet's location, else its UK postcode via postcodes.io),
 * then the current weather from Open-Meteo. Both are free and need no key;
 * answers are kept for 30 minutes per property, positions for a day.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { readForecast, ukPostcode, type Weather } from "./weather";

type Loose = { from: (t: string) => any };
const places = new Map<string, { at: number; spot: { lat: number; lng: number } | null }>();
const forecasts = new Map<string, { at: number; weather: Weather | null }>();

async function spotOf(db: Loose, p: { id: string; postcode: string | null; country_code: string | null }) {
  const hit = places.get(p.id);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.spot;
  let spot: { lat: number; lng: number } | null = null;
  const { data: dev, error } = await db.from("kiosk_devices").select("lat, lng").eq("property_id", p.id).not("lat", "is", null).limit(1).maybeSingle();
  if (!error && dev?.lat != null && dev?.lng != null) spot = { lat: dev.lat, lng: dev.lng };
  const pc = (p.country_code ?? "GB") === "GB" ? ukPostcode(p.postcode) : null;
  if (!spot && pc) {
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${pc}`, { signal: AbortSignal.timeout(5000) });
      const body = (await res.json()) as { result?: { latitude?: number; longitude?: number } };
      if (typeof body.result?.latitude === "number" && typeof body.result.longitude === "number") spot = { lat: body.result.latitude, lng: body.result.longitude };
    } catch {
      // No position: no weather today.
    }
  }
  places.set(p.id, { at: Date.now(), spot });
  return spot;
}

/** The weather now where this stay is, or null. */
export const getStayWeather = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, sha256 } = await import("./checkin.server");
    const db = (await admin()) as unknown as Loose;
    const { data: t } = await db.from("stay_tokens").select("booking_id, expires_at").eq("token_hash", sha256(data.token)).maybeSingle();
    if (!t || Date.parse(t.expires_at) < Date.now()) return null;
    const { data: b } = await db.from("bookings").select("property_id, properties(id, postcode, country_code)").eq("id", t.booking_id).maybeSingle();
    const p = b?.properties as { id: string; postcode: string | null; country_code: string | null } | undefined;
    if (!p) return null;
    const cached = forecasts.get(p.id);
    if (cached && Date.now() - cached.at < 30 * 60_000) return cached.weather;
    const spot = await spotOf(db, p);
    let weather: Weather | null = null;
    if (spot) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat.toFixed(3)}&longitude=${spot.lng.toFixed(3)}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        weather = res.ok ? readForecast(await res.json()) : null;
      } catch {
        weather = null;
      }
    }
    forecasts.set(p.id, { at: Date.now(), weather });
    return weather;
  });
