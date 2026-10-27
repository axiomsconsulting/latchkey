import { describe, expect, it } from "vitest";
import { describeWeather, readForecast, ukPostcode } from "@/lib/weather";

describe("weather", () => {
  it("describes WMO codes in plain words", () => {
    expect(describeWeather(0, true)).toEqual({ label: "Sunny", icon: "sun" });
    expect(describeWeather(0, false)).toEqual({ label: "Clear", icon: "moon" });
    expect(describeWeather(61, true)).toEqual({ label: "Light rain", icon: "rain" });
    expect(describeWeather(95, true).icon).toBe("storm");
    expect(describeWeather(999, true).label).toBe("Changeable");
  });
  it("reads Open-Meteo's answer", () => {
    expect(
      readForecast({
        current: { temperature_2m: 13.6, weather_code: 3, is_day: 1 },
        daily: { temperature_2m_max: [15.2], temperature_2m_min: [8.4] },
      }),
    ).toEqual({ temp: 14, high: 15, low: 8, code: 3, isDay: true });
    expect(readForecast({})).toBeNull();
  });
  it("tidies UK postcodes", () => {
    expect(ukPostcode("hp11 2ab")).toBe("HP112AB");
    expect(ukPostcode("not one")).toBeNull();
  });
});
