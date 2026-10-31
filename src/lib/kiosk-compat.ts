/**
 * Compatibility mode for older door tablets (an iPad 2 on Safari 9, an old
 * Android tablet's browser). The full kiosk needs a modern browser: module
 * scripts and the colour and layer features its styles use (color-mix and
 * friends, Safari 16.2 / Chrome 111 and later). A tablet without them opens
 * /lite/<code> instead, a plain page that runs on old browsers with fewer
 * features: guest cards, the host's welcome, express check-out, the bell,
 * and check-in on the guest's own phone by QR code. The host sees what the
 * tablet detected and can switch compatibility mode on or off per tablet
 * (kiosk_devices.compat; null = follow the detection). Pure; tested in
 * tests/kiosk-compat.test.ts.
 */

/** Per property, on the tablet: "on" (the host chose it) or "off" (the host chose the full kiosk). Older tablets only. */
export const compatKey = (code: string) => `latchkey.compat.${code}`;

/**
 * Three levels, from the plainest to the full kiosk. "enhanced" is the most an
 * older browser can show: the property's look with its line art, frame,
 * fonts, icons, clocks and transitions; "lite" is a plain, fast page for
 * the slowest tablets; "full" is the standard kiosk (modern browsers).
 */
export const KIOSK_MODES = ["lite", "enhanced", "full"] as const;
export type KioskMode = (typeof KIOSK_MODES)[number];

/** Per property, on the tablet: the level the host chose (kept so the next start goes straight there). */
export const modeKey = (code: string) => `latchkey.kioskMode.${code}`;

export type CompatSignals = {
  moduleScripts: boolean;
  colorMix: boolean;
  /** Flexible boxes (any prefix) and inline SVG: without them only the plain page works. */
  flexbox?: boolean;
  svg?: boolean;
};

/** Whether this browser needs compatibility mode. */
export const needsCompat = (s: CompatSignals) => !s.moduleScripts || !s.colorMix;

/** The richest level this browser can run. */
export function detectMode(s: CompatSignals): KioskMode {
  if (!needsCompat(s)) return "full";
  return s.flexbox === false || s.svg === false ? "lite" : "enhanced";
}

export const isMode = (v: unknown): v is KioskMode =>
  typeof v === "string" && (KIOSK_MODES as readonly string[]).includes(v);

/** The host's choice for a tablet (kiosk_devices.kiosk_mode, or the older on/off compat tick). */
export function chosenMode(r: { kiosk_mode?: unknown; compat?: unknown }): KioskMode | null {
  if (isMode(r.kiosk_mode)) return r.kiosk_mode;
  return r.compat === true ? "enhanced" : r.compat === false ? "full" : null;
}

/** What the tablet detected (kiosk_devices.mode_detected, or the older yes/no). */
export function detectedModeOf(r: {
  mode_detected?: unknown;
  compat_detected?: unknown;
}): KioskMode {
  if (isMode(r.mode_detected)) return r.mode_detected;
  return r.compat_detected === true ? "enhanced" : "full";
}

/** The level it runs: the host's choice, else what it detected. */
export const effectiveMode = (chosen: KioskMode | null | undefined, detected: KioskMode) =>
  chosen ?? detected;

/** Compatibility mode on this tablet: the host's choice, else what it detected. */
export const effectiveCompat = (chosen: boolean | null | undefined, detected: boolean) =>
  typeof chosen === "boolean" ? chosen : detected;

/** The older on/off tick that matches a level (kept in step for tablets on older versions). */
export const compatFor = (mode: KioskMode | null): boolean | null =>
  mode === null ? null : mode !== "full";

/** A level above what the tablet detected may not run there. */
export const aboveDetected = (mode: KioskMode, detected: KioskMode) =>
  KIOSK_MODES.indexOf(mode) > KIOSK_MODES.indexOf(detected);

/** "Safari 9 on iPad", "Chrome 70 on Android", for the host's tablet list. */
export function browserLabel(ua: string): string {
  const os = /iPad|iPhone|iPod/.test(ua)
    ? /iPad/.test(ua)
      ? "iPad"
      : "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Macintosh/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const m =
    ua.match(/(?:CriOS|Chrome)\/(\d+)/) ??
    ua.match(/(?:FxiOS|Firefox)\/(\d+)/) ??
    ua.match(/Silk\/(\d+)/) ??
    ua.match(/SamsungBrowser\/(\d+)/) ??
    ua.match(/Version\/(\d+)[.\d]*.*Safari/);
  const name = !m
    ? "Browser"
    : /CriOS|Chrome/.test(m[0])
      ? "Chrome"
      : /FxiOS|Firefox/.test(m[0])
        ? "Firefox"
        : /Silk/.test(m[0])
          ? "Silk"
          : /Samsung/.test(m[0])
            ? "Samsung Internet"
            : "Safari";
  // An iPad or iPhone app saved to the home screen has no browser version: it's Safari.
  const ios = ua.match(/OS (\d+)_(\d+)/);
  const label = m
    ? `${name} ${m[1]}`
    : (os === "iPad" || os === "iPhone") && /AppleWebKit/.test(ua)
      ? "Safari (home screen app)"
      : name;
  const where =
    os && ios && (os === "iPad" || os === "iPhone") ? `${os}, iOS ${ios[1]}.${ios[2]}` : os;
  return (where ? `${label} on ${where}` : label).slice(0, 120);
}

/**
 * Runs in the kiosk's <head> before anything else (plain ES5, so old
 * browsers run it too): on a shared kiosk, picks the level: the host's
 * choice kept on the tablet (modeKey; the older compatKey "on"/"off" too),
 * else what the browser can do. Lite and enhanced go to /lite/<code>. Full
 * on a browser that can't run it is tried, and if the app hasn't started
 * within 30 seconds (window.__lkBooted) the tablet goes to /lite/<code>?nofull=1,
 * so it is never left on a dead screen. Guests' own phones (?guest, ?resume,
 * ?join, small screens) stay.
 */
export const KIOSK_COMPAT_SCRIPT = `(function(){try{
if(/[?&](guest|resume|join)=/.test(location.search))return;
var m=location.pathname.match(/^\\/kiosk\\/([a-z0-9-]+)\\/?$/i);if(!m)return;
if(Math.min(screen.width,screen.height)<600)return;
var code=m[1].toLowerCase(),pref=null,old=null;
try{pref=localStorage.getItem("latchkey.kioskMode."+code);old=localStorage.getItem("latchkey.compat."+code)}catch(e){}
if(pref!=="lite"&&pref!=="enhanced"&&pref!=="full")pref=old==="on"?"enhanced":old==="off"?"full":null;
var mod="noModule" in document.createElement("script");
var mix=!!(window.CSS&&CSS.supports&&CSS.supports("color","color-mix(in srgb, red, blue)"));
var can=mod&&mix;
var mode=pref||(can?"full":"enhanced");
if(mode!=="full"){location.replace("/lite/"+code);return;}
if(!can)setTimeout(function(){if(!window.__lkBooted)location.replace("/lite/"+code+"?nofull=1")},30000);
}catch(e){}})();`;
