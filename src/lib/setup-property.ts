/**
 * What the set-up wizard (/app/setup) sends to saveProperty. Pure, tested.
 *
 * The country comes from the wizard's Country picker (the same choices and
 * the same "GB" starting value as the property form on Properties); the
 * server still requires a two-letter country (propertyInput in
 * host.functions.ts). `id` is the property already made by an earlier try,
 * so trying again updates it instead of making a second one.
 */
import { COUNTRY_CHOICES } from "./regions";

export const DEFAULT_SETUP_COUNTRY = "GB";

export type SetupPropertyForm = {
  name: string;
  address: string;
  postcode: string;
  short_code: string;
  country_code: string;
};

export type SetupTimes = {
  check_in: string;
  check_out: string;
  quiet_start: string;
  quiet_end: string;
  pin: string;
};

/** A country the wizard offers, or null. */
export function setupCountry(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return COUNTRY_CHOICES.some((x) => x.code === c) ? c : null;
}

export function setupPropertyPayload(
  hostId: string,
  p: SetupPropertyForm,
  t: SetupTimes,
  id?: string | null,
) {
  const country = setupCountry(p.country_code);
  if (!country) throw new Error("Choose the country your property is in.");
  return {
    ...(id ? { id } : {}),
    hostId,
    name: p.name.trim(),
    address: p.address.trim() || null,
    postcode: p.postcode.trim() || null,
    country_code: country,
    // Empty: the server makes a free one from the name.
    short_code: p.short_code.trim().toLowerCase(),
    // Only a whole six-digit PIN is sent; the PIN field stops anything else first.
    check_in_pin: /^\d{6}$/.test(t.pin) ? t.pin : null,
    timezone: "Europe/London",
    default_check_in_time: t.check_in,
    default_check_out_time: t.check_out,
    quiet_hours_start: t.quiet_start,
    quiet_hours_end: t.quiet_end,
  };
}
