/**
 * Today's weather on the stay guide, in plain words: the WMO weather codes
 * Open-Meteo returns (free, no key) as a short description and an icon. Pure.
 */
export type WeatherIcon =
  | "sun"
  | "moon"
  | "cloud-sun"
  | "cloud-moon"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm";

export type Weather = {
  temp: number;
  high: number | null;
  low: number | null;
  code: number;
  isDay: boolean;
};

export function describeWeather(
  code: number,
  isDay: boolean,
): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: isDay ? "Sunny" : "Clear", icon: isDay ? "sun" : "moon" };
  if (code === 1 || code === 2)
    return {
      label: code === 1 ? "Mostly clear" : "Partly cloudy",
      icon: isDay ? "cloud-sun" : "cloud-moon",
    };
  if (code === 3) return { label: "Cloudy", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Foggy", icon: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", icon: "drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return {
      label:
        code === 61 || code === 80
          ? "Light rain"
          : code === 65 || code === 82
            ? "Heavy rain"
            : "Rain",
      icon: "rain",
    };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { label: "Snow", icon: "snow" };
  if (code >= 95 && code <= 99) return { label: "Thunderstorms", icon: "storm" };
  return { label: "Changeable", icon: "cloud" };
}

/** Open-Meteo's "current" + "daily" answer → what the guide shows; null when it's not usable. */
export function readForecast(body: unknown): Weather | null {
  const b = (body && typeof body === "object" ? body : {}) as {
    current?: Record<string, unknown>;
    daily?: Record<string, unknown[]>;
  };
  const t = b.current?.["temperature_2m"];
  const code = b.current?.["weather_code"];
  if (typeof t !== "number" || typeof code !== "number") return null;
  const hi = b.daily?.["temperature_2m_max"]?.[0];
  const lo = b.daily?.["temperature_2m_min"]?.[0];
  return {
    temp: Math.round(t),
    high: typeof hi === "number" ? Math.round(hi) : null,
    low: typeof lo === "number" ? Math.round(lo) : null,
    code,
    isDay: b.current?.["is_day"] !== 0,
  };
}

/** A UK postcode as postcodes.io expects it, or null. */
export function ukPostcode(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(s) ? s : null;
}
