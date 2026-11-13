/**
 * What a door tablet is: maker, model, variant and screen size, worked out from what the
 * browser tells us. Browsers never give a serial number or a reliable model on every device:
 *   - Chrome on Android gives the model code through User-Agent Client Hints (model), and
 *     older Android browsers put it in the user agent ("Android 11; SM-X200 Build/…");
 *   - iPads never say which iPad: the screen size in points tells most models apart;
 *   - computers say only their operating system.
 * KNOWN maps common tablet model codes to names and screen sizes; anything else keeps its
 * own code. Sizes not known from the model are estimates from the screen and say "about".
 * Pure, tested in tests/device-model.test.ts.
 */

export type Hardware = {
  ua: string;
  /** navigator.userAgentData high-entropy "model" (Android Chrome), when given. */
  model?: string | null | undefined;
  platformVersion?: string | null | undefined;
  /** Screen in CSS pixels, either way up. */
  w: number;
  h: number;
  dpr?: number | null | undefined;
  touch?: number | null | undefined;
};

export type DeviceInfo = {
  maker: string | null;
  /** Model code as the device reports it, e.g. SM-X200, KFTRWI. */
  code: string | null;
  /** Friendly name, e.g. "Galaxy Tab A8". */
  model: string | null;
  /** Wi-Fi or Wi-Fi + mobile data, when the code says. */
  variant: string | null;
  os: string;
  osVersion: string | null;
  browser: string;
  /** Screen diagonal in inches. */
  inches: number | null;
  /** True when inches comes from the model, false when estimated from the screen. */
  inchesKnown: boolean;
  /** Short screen in CSS pixels, e.g. "800 × 1280". */
  screen: string | null;
  kind: "tablet" | "phone" | "computer";
  /** What the host sees until they name it: "Galaxy Tab A8 10.5-inch". */
  name: string;
};

type Known = { maker: string; model: string; inches: number };

/** Model code prefixes (upper case, without region letters) → maker, name and size. */
const KNOWN: Array<[RegExp, Known]> = [
  // Samsung Galaxy Tab
  [/^SM-X21\d/, { maker: "Samsung", model: "Galaxy Tab A9+", inches: 11 }],
  [/^SM-X11\d/, { maker: "Samsung", model: "Galaxy Tab A9", inches: 8.7 }],
  [/^SM-X20\d/, { maker: "Samsung", model: "Galaxy Tab A8", inches: 10.5 }],
  [/^SM-T22\d/, { maker: "Samsung", model: "Galaxy Tab A7 Lite", inches: 8.7 }],
  [/^SM-T50\d/, { maker: "Samsung", model: "Galaxy Tab A7", inches: 10.4 }],
  [/^SM-T51\d/, { maker: "Samsung", model: "Galaxy Tab A 10.1 (2019)", inches: 10.1 }],
  [/^SM-T29\d/, { maker: "Samsung", model: "Galaxy Tab A 8.0", inches: 8 }],
  [/^SM-T58\d/, { maker: "Samsung", model: "Galaxy Tab A 10.1 (2016)", inches: 10.1 }],
  [/^SM-P6[12]\d/, { maker: "Samsung", model: "Galaxy Tab S6 Lite", inches: 10.4 }],
  [/^SM-X30\d/, { maker: "Samsung", model: "Galaxy Tab Active4 Pro", inches: 10.1 }],
  [/^SM-X5[01]\d/, { maker: "Samsung", model: "Galaxy Tab S9 FE", inches: 10.9 }],
  [/^SM-X61\d/, { maker: "Samsung", model: "Galaxy Tab S9 FE+", inches: 12.4 }],
  [/^SM-X52\d/, { maker: "Samsung", model: "Galaxy Tab S10 FE", inches: 10.9 }],
  [/^SM-X70\d/, { maker: "Samsung", model: "Galaxy Tab S8", inches: 11 }],
  [/^SM-X71\d/, { maker: "Samsung", model: "Galaxy Tab S9", inches: 11 }],
  [/^SM-X80\d/, { maker: "Samsung", model: "Galaxy Tab S8+", inches: 12.4 }],
  [/^SM-T87\d/, { maker: "Samsung", model: "Galaxy Tab S7", inches: 11 }],
  [/^SM-T73\d/, { maker: "Samsung", model: "Galaxy Tab S7 FE", inches: 12.4 }],
  // Amazon Fire
  [/^KFTUWI/, { maker: "Amazon", model: "Fire HD 10 (2023)", inches: 10.1 }],
  [/^KFTRWI|^KFTRPWI/, { maker: "Amazon", model: "Fire HD 10 (2021)", inches: 10.1 }],
  [/^KFMAWI/, { maker: "Amazon", model: "Fire HD 10 (2019)", inches: 10.1 }],
  [/^KFSUWI/, { maker: "Amazon", model: "Fire HD 10 (2017)", inches: 10.1 }],
  [/^KFSNWI/, { maker: "Amazon", model: "Fire Max 11", inches: 11 }],
  [/^KFRAWI|^KFRAPWI/, { maker: "Amazon", model: "Fire HD 8 (2022)", inches: 8 }],
  [/^KFONWI/, { maker: "Amazon", model: "Fire HD 8 (2020)", inches: 8 }],
  [/^KFKAWI/, { maker: "Amazon", model: "Fire HD 8 (2018)", inches: 8 }],
  [/^KFQUWI/, { maker: "Amazon", model: "Fire 7 (2022)", inches: 7 }],
  [/^KFMUWI/, { maker: "Amazon", model: "Fire 7 (2019)", inches: 7 }],
  // Lenovo
  [/^TB-X606/, { maker: "Lenovo", model: "Tab M10 FHD Plus", inches: 10.3 }],
  [/^TB-X505/, { maker: "Lenovo", model: "Tab M10", inches: 10.1 }],
  [/^TB-X306/, { maker: "Lenovo", model: "Tab M10 HD (2nd gen)", inches: 10.1 }],
  [/^TB328/, { maker: "Lenovo", model: "Tab M10 (3rd gen)", inches: 10.1 }],
  [/^TB-8505/, { maker: "Lenovo", model: "Tab M8", inches: 8 }],
  [/^TB-J606/, { maker: "Lenovo", model: "Tab P11", inches: 11 }],
  [/^TB350/, { maker: "Lenovo", model: "Tab P11 (2nd gen)", inches: 11.5 }],
  [/^TB311/, { maker: "Lenovo", model: "Tab M11", inches: 11 }],
  // Teclast and other budget tablets keep their own code (P20HD, M40, T40 Plus, …).
  [/^P20HD/, { maker: "Teclast", model: "P20HD", inches: 10.1 }],
  [/^P30S/, { maker: "Teclast", model: "P30S", inches: 10.1 }],
  [/^M40/, { maker: "Teclast", model: "M40", inches: 10.1 }],
  [/^T40/, { maker: "Teclast", model: "T40", inches: 10.4 }],
  [/^T50/, { maker: "Teclast", model: "T50", inches: 11 }],
  // Google, Xiaomi
  [/^PIXEL TABLET/, { maker: "Google", model: "Pixel Tablet", inches: 10.95 }],
  [/^2303CRA44A|^23043RP34G/, { maker: "Xiaomi", model: "Redmi Pad SE", inches: 11 }],
];

/** iPads by screen in points (short × long) and sharpness. */
const IPADS: Array<{ w: number; h: number; model: string; inches: number }> = [
  { w: 1032, h: 1376, model: "iPad Pro 13-inch (M4)", inches: 13 },
  { w: 1024, h: 1366, model: "iPad Pro or Air 12.9/13-inch", inches: 12.9 },
  { w: 834, h: 1210, model: "iPad Pro 11-inch (M4)", inches: 11 },
  { w: 834, h: 1194, model: "iPad Pro or Air 11-inch", inches: 11 },
  { w: 820, h: 1180, model: "iPad Air or iPad (10th gen) 10.9-inch", inches: 10.9 },
  { w: 834, h: 1112, model: "iPad Air (3rd gen) or Pro 10.5-inch", inches: 10.5 },
  { w: 810, h: 1080, model: "iPad 10.2-inch (7th–9th gen)", inches: 10.2 },
  { w: 744, h: 1133, model: "iPad mini (6th gen or later)", inches: 8.3 },
  { w: 768, h: 1024, model: "iPad 9.7-inch or iPad mini", inches: 9.7 },
];

const MAKER_HINTS: Array<[RegExp, string]> = [
  [/^SM-|SAMSUNG/i, "Samsung"],
  [/^KF[A-Z]{2,5}WI|Silk\//i, "Amazon"],
  [/^TB-?|Lenovo/i, "Lenovo"],
  [/Teclast/i, "Teclast"],
  [/^Pixel/i, "Google"],
  [/Xiaomi|Redmi|^2\d{3}[A-Z0-9]{5,}/i, "Xiaomi"],
  [/Huawei|^(AGS|BAH|KOB|MRX)\d?-/i, "Huawei"],
  [/Alldocube|iPlay/i, "Alldocube"],
  [/Blackview/i, "Blackview"],
  [/Doogee/i, "Doogee"],
];

/** "Android 11; SM-X200 Build/…" → SM-X200. Reduced user agents say only "K". */
export function modelFromUa(ua: string): string | null {
  const m = ua.match(
    /Android [\d.]+;\s*(?:[a-z]{2}[-_][a-z]{2};\s*)?([^;)]+?)(?:\s+Build\/[^;)]*)?[;)]/i,
  );
  const code = m?.[1]?.trim() ?? null;
  if (!code || code === "K" || /^(wv|mobile|tablet|linux|u)$/i.test(code)) return null;
  return code.replace(/^Lenovo\s+/i, "");
}

function variantOf(code: string | null): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  // Samsung: …0 is Wi-Fi only, …5/…6/…7 has mobile data (SM-X200 / SM-X205).
  const sam = c.match(/^SM-[TXP]\d{2}(\d)/);
  if (sam) return sam[1] === "0" ? "Wi-Fi" : /[5-7]/.test(sam[1]!) ? "Wi-Fi + mobile data" : null;
  // Lenovo: …F is Wi-Fi only, …X/…L has mobile data.
  const len = c.match(/^TB-?[A-Z]?\d{3,4}([FXL])/);
  if (len) return len[1] === "F" ? "Wi-Fi" : "Wi-Fi + mobile data";
  return null;
}

function osOf(hw: Hardware): { os: string; version: string | null } {
  const ua = hw.ua;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (hw.touch ?? 0) > 1)) {
    const v = ua.match(/OS (\d+)[_.](\d+)/) ?? ua.match(/Version\/(\d+)\.(\d+)/);
    return { os: /iPhone|iPod/.test(ua) ? "iOS" : "iPadOS", version: v ? `${v[1]}.${v[2]}` : null };
  }
  if (/Android/.test(ua)) {
    const v = hw.platformVersion?.split(".")[0] || ua.match(/Android ([\d.]+)/)?.[1] || null;
    return { os: /Silk\//.test(ua) ? "Fire OS" : "Android", version: v };
  }
  if (/Windows/.test(ua)) return { os: "Windows", version: null };
  if (/CrOS/.test(ua)) return { os: "ChromeOS", version: null };
  if (/Mac OS X|Macintosh/.test(ua)) return { os: "macOS", version: null };
  if (/Linux/.test(ua)) return { os: "Linux", version: null };
  return { os: "Other", version: null };
}

export function browserOf(ua: string): string {
  const v = (re: RegExp) => ua.match(re)?.[1]?.split(".")[0];
  if (/Silk\//.test(ua)) return `Silk ${v(/Silk\/([\d.]+)/) ?? ""}`.trim();
  if (/SamsungBrowser\//.test(ua)) return `Samsung Internet ${v(/SamsungBrowser\/([\d.]+)/)}`;
  if (/Edg[A]?\//.test(ua)) return `Edge ${v(/Edg[A]?\/([\d.]+)/)}`;
  if (/Firefox\/|FxiOS\//.test(ua)) return `Firefox ${v(/(?:Firefox|FxiOS)\/([\d.]+)/)}`;
  if (/CriOS\//.test(ua)) return `Chrome ${v(/CriOS\/([\d.]+)/)}`;
  if (/Chrome\//.test(ua)) return `Chrome ${v(/Chrome\/([\d.]+)/)}`;
  if (/Safari\//.test(ua)) return `Safari ${v(/Version\/([\d.]+)/) ?? ""}`.trim();
  return "Browser";
}

const round = (n: number) => Math.round(n * 10) / 10;
const inchText = (n: number) => `${Number.isInteger(n) ? n : round(n)}-inch`;

export function describeDevice(hw: Hardware): DeviceInfo {
  const ua = hw.ua ?? "";
  const { os, version } = osOf(hw);
  const short = Math.round(Math.min(hw.w, hw.h));
  const long = Math.round(Math.max(hw.w, hw.h));
  const screen = short > 0 ? `${short} × ${long}` : null;
  const code = (hw.model?.trim() || modelFromUa(ua) || null)?.slice(0, 40) ?? null;
  const upper = code?.toUpperCase() ?? "";
  const known = code ? (KNOWN.find(([re]) => re.test(upper))?.[1] ?? null) : null;
  const maker =
    known?.maker ??
    (code ? (MAKER_HINTS.find(([re]) => re.test(code))?.[1] ?? null) : null) ??
    (os === "iPadOS" || os === "iOS" || os === "macOS"
      ? "Apple"
      : /Silk\//.test(ua)
        ? "Amazon"
        : null);

  let model = known?.model ?? code;
  let inches: number | null = known?.inches ?? null;
  let inchesKnown = inches !== null;
  if (os === "iPadOS" && short > 0) {
    const ipad = IPADS.find((p) => Math.abs(p.w - short) <= 2 && Math.abs(p.h - long) <= 2);
    model = ipad?.model ?? "iPad";
    inches = ipad?.inches ?? null;
    inchesKnown = !!ipad;
  } else if (os === "iOS") {
    model = "iPhone";
  }

  const isTouch = (hw.touch ?? 0) > 0 || /Android|iPad|iPhone/.test(ua);
  const kind: DeviceInfo["kind"] = !isTouch
    ? "computer"
    : os === "iOS" || (/Mobile/.test(ua) && os === "Android" && short < 600) || short < 500
      ? "phone"
      : "tablet";

  // No model size: estimate from the screen. Android tablets lay out at ~160 CSS px per inch
  // (a little less on 10-inch ones), iPads at ~132 points per inch.
  if (inches === null && short > 0 && kind !== "computer") {
    const diag = Math.hypot(short, long);
    const perInch = os === "iPadOS" ? 132 : kind === "phone" ? 150 : 145;
    inches = round(diag / perInch);
    inchesKnown = false;
  }

  const base =
    kind === "computer"
      ? os === "macOS"
        ? "Mac"
        : os === "ChromeOS"
          ? "Chromebook"
          : `${os} computer`
      : [
          maker &&
          model &&
          !model.startsWith(maker) &&
          !/^(iPad|iPhone|Galaxy|Fire|Pixel)/.test(model)
            ? maker
            : null,
          model ?? (kind === "phone" ? `${os} phone` : `${os} tablet`),
        ]
          .filter(Boolean)
          .join(" ");
  const size =
    inches !== null && kind !== "computer" && !(model ?? "").includes("-inch")
      ? `${inchesKnown ? "" : "about "}${inchText(inches)}`
      : null;
  return {
    maker,
    code,
    model,
    variant: variantOf(code),
    os,
    osVersion: version,
    browser: browserOf(ua),
    inches,
    inchesKnown,
    screen,
    kind,
    name: [base, size && inchesKnown ? size : null].filter(Boolean).join(" ").slice(0, 40),
  };
}

/** One line for the host: "Samsung · Wi-Fi · 10.5-inch · Android 14 · Chrome 131". */
export function deviceLine(d: DeviceInfo): string {
  return [
    d.code && d.code !== d.model ? d.code : null,
    d.variant,
    d.inches !== null ? `${d.inchesKnown ? "" : "about "}${inchText(d.inches)}` : null,
    d.screen ? `${d.screen} px` : null,
    [d.os, d.osVersion].filter(Boolean).join(" "),
    d.browser,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function normaliseDeviceInfo(raw: unknown): DeviceInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<DeviceInfo>;
  return typeof r.name === "string" && typeof r.os === "string" ? (r as DeviceInfo) : null;
}

/** Browser only: this device's details for describeDevice (model from Client Hints where offered). */
export async function readHardware(): Promise<Hardware | null> {
  if (typeof navigator === "undefined" || typeof window === "undefined") return null;
  let model: string | null = null;
  let platformVersion: string | null = null;
  try {
    const uad = (
      navigator as unknown as {
        userAgentData?: {
          getHighEntropyValues: (
            h: string[],
          ) => Promise<{ model?: string; platformVersion?: string }>;
        };
      }
    ).userAgentData;
    if (uad) {
      const v = await Promise.race([
        uad.getHighEntropyValues(["model", "platformVersion"]),
        new Promise<null>((r) => setTimeout(() => r(null), 1500)),
      ]);
      model = v?.model?.trim() || null;
      platformVersion = v?.platformVersion?.trim() || null;
    }
  } catch {
    // Not offered: the user agent and screen still say a lot.
  }
  return {
    ua: navigator.userAgent.slice(0, 500),
    model,
    platformVersion,
    w: window.screen.width,
    h: window.screen.height,
    dpr: window.devicePixelRatio,
    touch: navigator.maxTouchPoints,
  };
}
