import { describe, expect, it } from "vitest";

import { propertyInput } from "@/lib/host.functions";
import { DEFAULT_SETUP_COUNTRY, setupCountry, setupPropertyPayload } from "@/lib/setup-property";

const HOST = "11111111-1111-4111-8111-111111111111";
const PROP = "22222222-2222-4222-8222-222222222222";
const form = {
  name: " The Hill Suites ",
  address: "1 Example Lane, Demo Town (fictional)",
  postcode: "ZZ1 1ZZ",
  short_code: "Hill-Suites-Video-Demo",
  country_code: DEFAULT_SETUP_COUNTRY,
};
const times = {
  check_in: "15:00",
  check_out: "10:00",
  quiet_start: "22:00",
  quiet_end: "08:00",
  pin: "482700",
};

describe("set-up wizard's property", () => {
  it("the server still refuses a property with no country (the reported error)", () => {
    const { country_code: _drop, ...noCountry } = setupPropertyPayload(HOST, form, times);
    const r = propertyInput.safeParse(noCountry);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["country_code"]);
  });

  it("sends the chosen country, six-digit PIN and times, and the server accepts it", () => {
    const parsed = propertyInput.parse(setupPropertyPayload(HOST, form, times));
    expect(parsed).toMatchObject({
      hostId: HOST,
      name: "The Hill Suites",
      country_code: "GB",
      short_code: "hill-suites-video-demo",
      check_in_pin: "482700",
      default_check_in_time: "15:00",
      default_check_out_time: "10:00",
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
    });
    expect(parsed.id).toBeUndefined();
    expect(
      propertyInput.parse(setupPropertyPayload(HOST, { ...form, country_code: "ie" }, times))
        .country_code,
    ).toBe("IE");
  });

  it("updates the property an earlier try made instead of making another", () => {
    expect(propertyInput.parse(setupPropertyPayload(HOST, form, times, PROP)).id).toBe(PROP);
  });

  it("refuses a country it doesn't offer, and never sends a short PIN", () => {
    expect(setupCountry("XX")).toBeNull();
    expect(setupCountry("")).toBeNull();
    expect(() => setupPropertyPayload(HOST, { ...form, country_code: "" }, times)).toThrow(
      /country/,
    );
    expect(setupPropertyPayload(HOST, form, { ...times, pin: "4827" }).check_in_pin).toBeNull();
    // The server's own rule stays: four digits are refused.
    expect(
      propertyInput.safeParse({ ...setupPropertyPayload(HOST, form, times), check_in_pin: "4827" })
        .success,
    ).toBe(false);
  });
});
