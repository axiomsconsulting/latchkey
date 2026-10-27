/**
 * Regional wording. A property in Ohio should say "ZIP code", not "postcode",
 * so every address-ish label in the app comes from here, keyed by the
 * property's country. Pure and tested: no UI, no database.
 */

export type CountryCode = "GB" | "IE" | "US" | "CA" | "AU" | "NZ";

export type Region = {
  code: CountryCode;
  country: string;
  /** What the last line of an address is called. */
  postcodeLabel: string;
  postcodePlaceholder: string;
  /** The middle administrative line, when the country uses one. */
  regionLabel: string;
  regionPlaceholder: string;
  addressLabel: string;
  /** What people call a mobile telephone. */
  mobileLabel: string;
  /** International dialling prefix, used when tidying WhatsApp numbers. */
  dialCode: string;
  currency: string;
};

export const REGIONS: Record<CountryCode, Region> = {
  GB: {
    code: "GB",
    country: "United Kingdom",
    postcodeLabel: "Postcode",
    postcodePlaceholder: "HP13 5AA",
    regionLabel: "County",
    regionPlaceholder: "Buckinghamshire",
    addressLabel: "Address",
    mobileLabel: "Mobile",
    dialCode: "44",
    currency: "GBP",
  },
  IE: {
    code: "IE",
    country: "Ireland",
    postcodeLabel: "Eircode",
    postcodePlaceholder: "D02 AF30",
    regionLabel: "County",
    regionPlaceholder: "Co. Dublin",
    addressLabel: "Address",
    mobileLabel: "Mobile",
    dialCode: "353",
    currency: "EUR",
  },
  US: {
    code: "US",
    country: "United States",
    postcodeLabel: "ZIP code",
    postcodePlaceholder: "94110",
    regionLabel: "State",
    regionPlaceholder: "California",
    addressLabel: "Street address",
    mobileLabel: "Cell phone",
    dialCode: "1",
    currency: "USD",
  },
  CA: {
    code: "CA",
    country: "Canada",
    postcodeLabel: "Postal code",
    postcodePlaceholder: "M5V 2T6",
    regionLabel: "Province",
    regionPlaceholder: "Ontario",
    addressLabel: "Street address",
    mobileLabel: "Cell phone",
    dialCode: "1",
    currency: "CAD",
  },
  AU: {
    code: "AU",
    country: "Australia",
    postcodeLabel: "Postcode",
    postcodePlaceholder: "2000",
    regionLabel: "State",
    regionPlaceholder: "New South Wales",
    addressLabel: "Street address",
    mobileLabel: "Mobile",
    dialCode: "61",
    currency: "AUD",
  },
  NZ: {
    code: "NZ",
    country: "New Zealand",
    postcodeLabel: "Postcode",
    postcodePlaceholder: "6011",
    regionLabel: "Region",
    regionPlaceholder: "Wellington",
    addressLabel: "Street address",
    mobileLabel: "Mobile",
    dialCode: "64",
    currency: "NZD",
  },
};

export const COUNTRY_CHOICES = Object.values(REGIONS).map((r) => ({
  code: r.code,
  country: r.country,
}));

/** Falls back to the UK: the demo business and most early hosts are British. */
export function region(code: string | null | undefined): Region {
  const key = (code ?? "").toUpperCase() as CountryCode;
  return REGIONS[key] ?? REGIONS.GB;
}

export function isCountryCode(code: string): code is CountryCode {
  return Object.prototype.hasOwnProperty.call(REGIONS, code.toUpperCase());
}
