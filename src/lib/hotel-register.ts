/**
 * The UK guest register required by the Immigration (Hotel Records) Order
 * 1972 for any premises that provide sleeping accommodation for reward.
 *
 *  - Everyone aged 16 or over gives their full name and nationality on
 *    arrival (art. 4(1)).
 *  - An "alien" also gives the number and place of issue of their passport
 *    or other identity document, and their next destination, with the full
 *    address if they know it (art. 4(2)).
 *  - The keeper records the arrival date and all of the above and keeps it
 *    for at least 12 months, open to inspection by the police or anyone the
 *    Home Secretary authorises (art. 5).
 *
 * "Alien" means anyone who is not a Commonwealth citizen, a British protected
 * person or an Irish citizen. Commonwealth citizens are British citizens,
 * British overseas territories citizens, British Overseas citizens, British
 * subjects, and citizens of the countries in Schedule 3 of the British
 * Nationality Act 1981 (as in force 11 October 2026). Pure, so it can be
 * unit tested.
 */

export const REGISTER_AGE = 16;
export const REGISTER_MONTHS = 12;

/** British statuses that aren't a country of their own. */
export const BRITISH_STATUSES = {
  GB: "British citizen",
  "GB-OTC": "British overseas territories citizen",
  "GB-BOC": "British Overseas citizen",
  "GB-BNO": "British National (Overseas)",
  "GB-SUB": "British subject",
  "GB-BPP": "British protected person",
} as const;

/**
 * Schedule 3, British Nationality Act 1981, as ISO 3166 codes. "Western
 * Samoa" is Samoa (WS); "Republic of Cyprus" is CY; "Saint Christopher and
 * Nevis" is KN. Zimbabwe remains listed although it left the Commonwealth.
 */
export const SCHEDULE_3 = [
  "AG",
  "AU",
  "BS",
  "BD",
  "BB",
  "BZ",
  "BW",
  "BN",
  "CM",
  "CA",
  "CY",
  "DM",
  "SZ",
  "FJ",
  "GA",
  "GM",
  "GH",
  "GD",
  "GY",
  "IN",
  "JM",
  "KE",
  "KI",
  "LS",
  "MW",
  "MY",
  "MV",
  "MT",
  "MU",
  "MZ",
  "NR",
  "NZ",
  "NG",
  "PK",
  "PG",
  "RW",
  "KN",
  "LC",
  "VC",
  "SC",
  "SL",
  "SG",
  "SB",
  "ZA",
  "LK",
  "TZ",
  "TG",
  "TO",
  "TT",
  "TV",
  "UG",
  "VU",
  "WS",
  "ZM",
  "ZW",
  "NA",
] as const;

/** Every country of nationality, ISO 3166-1 alpha-2 (GB is a British status above). */
const COUNTRIES = (
  "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD " +
  "CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR " +
  "IQ IE IL IT JM JP JO KZ KE KI XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ " +
  "MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK " +
  "SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE US UY UZ VU VA VE VN YE ZM ZW"
).split(" ");

const NOT_ALIEN = new Set<string>([...Object.keys(BRITISH_STATUSES), "IE", ...SCHEDULE_3]);

export function isNationality(code: string): boolean {
  return code in BRITISH_STATUSES || COUNTRIES.includes(code) || code === "XX";
}

/** True when the Order asks for document details and next destination too. */
export function isAlien(code: string | null | undefined): boolean {
  if (!code) return false;
  return !NOT_ALIEN.has(code);
}

let names: Intl.DisplayNames | null = null;

/** "France", "British citizen", or "Stateless". */
export function nationalityName(code: string): string {
  if (code in BRITISH_STATUSES) return BRITISH_STATUSES[code as keyof typeof BRITISH_STATUSES];
  if (code === "XX") return "Stateless or unknown";
  try {
    names ??= new Intl.DisplayNames(["en-GB"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** British and Irish first (the most common answers), then everyone A to Z. */
export function nationalityOptions(): Array<{ code: string; name: string }> {
  const top = ["GB", "IE"];
  const rest = [
    ...Object.keys(BRITISH_STATUSES).filter((c) => c !== "GB"),
    ...COUNTRIES.filter((c) => c !== "IE"),
    "XX",
  ]
    .map((code) => ({ code, name: nationalityName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  return [...top.map((code) => ({ code, name: nationalityName(code) })), ...rest];
}

const BRITISH = new Set([
  "GBR",
  "GB",
  "UK",
  "BRITISH",
  "BRITISH CITIZEN",
  "UNITED KINGDOM",
  "GREAT BRITAIN",
  "ENGLAND",
  "ENGLISH",
  "SCOTLAND",
  "SCOTTISH",
  "WALES",
  "WELSH",
  "NORTHERN IRELAND",
]);

/**
 * The nationality to start the register's choice on when the ID prints none
 * (a UK driving licence): the issuing country. Still asked, so the guest
 * confirms it with one tap rather than searching the list.
 */
export function suggestedNationality(read: {
  nationality: string | null;
  issuingCountry?: string | null;
  issuingCountryCode?: string | null;
}): string | null {
  return (
    nationalityFromId(read.nationality) ??
    nationalityFromId(read.issuingCountryCode) ??
    nationalityFromId(read.issuingCountry)
  );
}

/** Turns what an ID reader saw ("GBR", "France", "FR") into a code we list. */
export function nationalityFromId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  if (BRITISH.has(v.replace(/\./g, "").replace(/\s+/g, " "))) return "GB";
  if (ALPHA3[v]) return ALPHA3[v];
  if (v.length === 2 && isNationality(v)) return v;
  const byName = nationalityOptions().find((o) => o.name.toUpperCase() === v);
  return byName?.code ?? null;
}

/** The handful of alpha-3 codes passports print most often in the UK. */
const ALPHA3: Record<string, string> = {
  IRL: "IE",
  FRA: "FR",
  DEU: "DE",
  D: "DE",
  ESP: "ES",
  ITA: "IT",
  NLD: "NL",
  BEL: "BE",
  PRT: "PT",
  POL: "PL",
  ROU: "RO",
  USA: "US",
  CAN: "CA",
  AUS: "AU",
  NZL: "NZ",
  IND: "IN",
  PAK: "PK",
  CHN: "CN",
  JPN: "JP",
  KOR: "KR",
  BRA: "BR",
  MEX: "MX",
  ZAF: "ZA",
  NGA: "NG",
  SWE: "SE",
  NOR: "NO",
  DNK: "DK",
  FIN: "FI",
  CHE: "CH",
  AUT: "AT",
  GRC: "GR",
  TUR: "TR",
  UKR: "UA",
  HKG: "HK",
  SGP: "SG",
  MYS: "MY",
  ARE: "AE",
  SAU: "SA",
  ISR: "IL",
  EGY: "EG",
  BGD: "BD",
  LKA: "LK",
  KEN: "KE",
  GHA: "GH",
};

/** Who on a stay has to be in the register: every adult, and children 16 or over. */
export function registerPositions(adults: number, childAges: number[]): number[] {
  const out = Array.from({ length: adults }, (_, i) => i);
  childAges.forEach((age, i) => {
    if (age >= REGISTER_AGE) out.push(adults + i);
  });
  return out;
}

/** The register applies to accommodation in the United Kingdom. */
export function registerApplies(countryCode: string | null | undefined): boolean {
  return (countryCode ?? "GB").toUpperCase() === "GB";
}

/** Kept for at least 12 months from arrival; removed the day after. */
export function registerKeepUntil(arrivalDate: string): string {
  const [y, m, d] = arrivalDate.split("-").map(Number) as [number, number, number];
  const date = new Date(
    Date.UTC(y + Math.floor(REGISTER_MONTHS / 12), m - 1 + (REGISTER_MONTHS % 12), d),
  );
  // 29 February rolls to 1 March, which is still at least 12 months.
  return date.toISOString().slice(0, 10);
}

export type RegisterInput = {
  fullName: string;
  nationality: string;
  documentNumber?: string | null | undefined;
  placeOfIssue?: string | null | undefined;
  nextDestination?: string | null | undefined;
  nextAddress?: string | null | undefined;
};

export type RegisterEntry = {
  fullName: string;
  nationality: string;
  alien: boolean;
  documentNumber: string | null;
  placeOfIssue: string | null;
  nextDestination: string | null;
  nextAddress: string | null;
};

export type RegisterProblem = "name" | "nationality" | "document" | "place" | "destination";

/**
 * Checks one person's entry. Document details and next destination are only
 * kept for aliens: nobody else is asked, and anything sent anyway is dropped.
 */
export function cleanRegisterEntry(
  input: RegisterInput,
): { ok: true; entry: RegisterEntry } | { ok: false; missing: RegisterProblem[] } {
  const text = (v: string | null | undefined, max: number) =>
    (v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const fullName = text(input.fullName, 120);
  const nationality = input.nationality.trim().toUpperCase();
  const alien = isNationality(nationality) && isAlien(nationality);
  const documentNumber = text(input.documentNumber, 40).toUpperCase();
  const placeOfIssue = text(input.placeOfIssue, 80);
  const nextDestination = text(input.nextDestination, 120);
  const nextAddress = text(input.nextAddress, 300);

  const missing: RegisterProblem[] = [];
  if (fullName.length < 3 || fullName.split(" ").length < 2) missing.push("name");
  if (!isNationality(nationality)) missing.push("nationality");
  if (alien) {
    if (documentNumber.replace(/[^A-Z0-9]/g, "").length < 4) missing.push("document");
    if (placeOfIssue.length < 2) missing.push("place");
    if (nextDestination.length < 2) missing.push("destination");
  }
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    entry: {
      fullName,
      nationality,
      alien,
      documentNumber: alien ? documentNumber : null,
      placeOfIssue: alien ? placeOfIssue : null,
      nextDestination: alien ? nextDestination : null,
      nextAddress: alien && nextAddress ? nextAddress : null,
    },
  };
}

/** One CSV line per guest, in the order an inspecting officer reads it. */
export function registerCsv(
  rows: Array<{
    arrival_date: string;
    full_name: string;
    nationality: string;
    document_number: string | null;
    place_of_issue: string | null;
    next_destination: string | null;
    next_address: string | null;
    property_name: string;
    room_name: string | null;
  }>,
): string {
  const head = [
    "Arrival date",
    "Full name",
    "Nationality",
    "Passport or ID number",
    "Place of issue",
    "Next destination",
    "Address there",
    "Property",
    "Room",
  ];
  const cell = (v: string | null) => {
    const s = v ?? "";
    // A leading = + - @ would run as a formula in a spreadsheet.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = rows.map((r) =>
    [
      r.arrival_date,
      r.full_name,
      nationalityName(r.nationality),
      r.document_number,
      r.place_of_issue,
      r.next_destination,
      r.next_address,
      r.property_name,
      r.room_name,
    ]
      .map(cell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}

/** What an ID reader saw that the register can use. */
export type RegisterRead = {
  fullName: string | null;
  nationality: string | null;
  documentNumber: string | null;
  placeOfIssue: string | null;
  issuingCountry?: string | null;
};

export type RegisterPlan =
  /** Everything the register needs was on the ID: kept without asking. */
  | { kind: "saved"; entry: RegisterEntry }
  /** Only these few things weren't on the ID (UK driving licences don't print nationality; nobody's ID says where they go next). */
  | { kind: "ask"; missing: Exclude<RegisterProblem, "name">[]; input: RegisterInput }
  /** The ID couldn't be read: nothing is asked; the host adds them from the kept photo. */
  | { kind: "later" };

/**
 * The register entry from a person's own ID: name, nationality as printed
 * and, for guests who need them, document number and place of issue (the
 * issuing country when no place is printed). Only what's missing is asked;
 * without a readable name nothing is, and the host completes it later.
 */
export function registerFromRead(read: RegisterRead | null): RegisterPlan {
  if (!read?.fullName) return { kind: "later" };
  const input: RegisterInput = {
    fullName: read.fullName,
    nationality: nationalityFromId(read.nationality) ?? "",
    documentNumber: read.documentNumber,
    placeOfIssue: read.placeOfIssue ?? read.issuingCountry ?? null,
  };
  const clean = cleanRegisterEntry(input);
  if (clean.ok) return { kind: "saved", entry: clean.entry };
  if (clean.missing.includes("name")) return { kind: "later" };
  return {
    kind: "ask",
    missing: clean.missing.filter((m): m is Exclude<RegisterProblem, "name"> => m !== "name"),
    input,
  };
}
