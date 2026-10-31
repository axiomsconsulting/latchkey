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

/** Per property, on the tablet: "on" (the host chose it) or "off" (the host chose the full kiosk). */
export const compatKey = (code: string) => `latchkey.compat.${code}`;

export type CompatSignals = { moduleScripts: boolean; colorMix: boolean };

/** Whether this browser needs compatibility mode. */
export const needsCompat = (s: CompatSignals) => !s.moduleScripts || !s.colorMix;

/** Compatibility mode on this tablet: the host's choice, else what it detected. */
export const effectiveCompat = (chosen: boolean | null | undefined, detected: boolean) =>
  typeof chosen === "boolean" ? chosen : detected;

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
 * browsers run it too): on a shared kiosk, a browser that can't run the full
 * kiosk, or a tablet the host put in compatibility mode, goes to /lite/<code>.
 * Guests' own phones (?guest, ?resume, ?join, small screens) stay.
 */
export const KIOSK_COMPAT_SCRIPT = `(function(){try{
if(/[?&](guest|resume|join)=/.test(location.search))return;
var m=location.pathname.match(/^\\/kiosk\\/([a-z0-9-]+)\\/?$/i);if(!m)return;
if(Math.min(screen.width,screen.height)<600)return;
var code=m[1].toLowerCase(),pref=null;
try{pref=localStorage.getItem("latchkey.compat."+code)}catch(e){}
if(pref==="off")return;
var old=pref==="on";
if(!old){var mod="noModule" in document.createElement("script");
var mix=!!(window.CSS&&CSS.supports&&CSS.supports("color","color-mix(in srgb, red, blue)"));
old=!mod||!mix;}
if(old)location.replace("/lite/"+code);
}catch(e){}})();`;
