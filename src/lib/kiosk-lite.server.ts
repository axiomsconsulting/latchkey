/**
 * The compatible kiosk for older tablets (/lite/<code>, src/lib/kiosk-compat.ts):
 * a plain page (no app bundle) whose script, public/kiosk-lite.js, is ES5 and
 * talks to /api/public/kiosk-lite/<code>. Both reuse the full kiosk's server
 * functions (tablet check-in, cards, welcome, express check-out, the bell),
 * so the rules are the same; only the screen is simpler. Check-in itself
 * happens on the guest's own phone, by QR code (old tablets have no camera
 * access in the browser).
 */
import { kioskLite as copy } from "@/content/copy";
import { APP_VERSION } from "@/lib/app-version";
import { cardEdge, cardInk } from "@/lib/checkout-goodbye";
import { browserLabel } from "@/lib/kiosk-compat";
import { themeVars } from "@/lib/theme";
import { zonedParts } from "@/lib/dates";

/** Escapes text for HTML. */
export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** JSON that's safe inside a <script> element. */
export const scriptJson = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/\u2028|\u2029/g, " ");

/** Minutes the property's wall clock is ahead of UTC now (the old tablet can't work out time zones). */
export function zoneOffsetMinutes(tz: string, now = new Date()): number {
  const z = zonedParts(now, tz);
  const wall = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute);
  return Math.round((wall - Math.floor(now.getTime() / 60_000) * 60_000) / 60_000);
}

/** A QR code as inline SVG (old browsers draw inline SVG; no canvas or script needed). */
export async function qrSvg(text: string): Promise<string> {
  try {
    // Only the QR maths and the SVG drawing: the package's main entry also loads its PNG
    // writer, which needs the file system the live (Workers) server doesn't have.
    type Core = { create: (t: string, o: { errorCorrectionLevel: string }) => unknown };
    type Svg = { render: (qr: unknown, o: { margin: number }) => string };
    const core = (await import(
      // @ts-expect-error -- a plain JS file inside qrcode, without its own types
      "qrcode/lib/core/qrcode"
    )) as Core | { default: Core };
    const svg = (await import(
      // @ts-expect-error -- as above
      "qrcode/lib/renderer/svg-tag"
    )) as Svg | { default: Svg };
    const C = "create" in core ? core : core.default;
    const S = "render" in svg ? svg : svg.default;
    return S.render(C.create(text, { errorCorrectionLevel: "M" }), { margin: 1 });
  } catch {
    return "";
  }
}

/** The words the page shows; {t}, {n} and {of} are filled in on the tablet. */
function words(name: string) {
  return {
    welcome: copy.welcome(name),
    scan: copy.scan,
    orVisit: copy.orVisit,
    checkIn: copy.checkIn,
    checkInHere: copy.checkInHere,
    express: copy.express,
    arriving: copy.arriving("{t}"),
    leaving: copy.leaving("{t}"),
    page: copy.page("{n}", "{of}"),
    inCount: copy.inCount("{n}"),
    outCount: copy.outCount("{n}"),
    thanks: copy.thanks("{name}"),
    thanksNoName: copy.thanks(""),
    lockDoor: copy.lockDoor,
    review: copy.review,
    done: copy.done,
    close: copy.close,
    setup: copy.setup("{code}"),
    update: copy.update("{v}"),
    tapHint: copy.tapHint,
    bellTitle: copy.bellTitle,
    bellHelp: copy.bellHelp,
    bellArriving: copy.bellArriving,
    bellLeaving: copy.bellLeaving,
    bellOnScreen: copy.bellOnScreen,
    bellAutoAt: copy.bellAutoAt("{t}"),
    bellNotSet: copy.bellNotSet,
    bellApply: copy.bellApply,
    bellEmpty: copy.bellEmpty,
    error: copy.error,
    takeId: copy.takeId,
    idHint: copy.idHint,
    orPhone: copy.orPhone,
    reading: copy.reading,
    retry: copy.retry,
    tryAgain: copy.tryAgain,
    locked: copy.locked,
    notFound: copy.notFound,
    matched: copy.matched("{name}"),
    finishPhone: copy.finishPhone,
    offline: copy.offline,
  };
}

type LiteProperty = {
  name: string;
  code: string;
  timezone: string | null;
  theme: Parameters<typeof themeVars>[0];
};

/** The page itself: colours as plain values (no CSS variables, colour mixing or layers). */
export async function liteHtml(p: LiteProperty, origin: string): Promise<string> {
  const v = themeVars(p.theme);
  const c = (k: string, d: string) => {
    const x = v[k];
    return x && /^#[0-9a-f]{3,8}$/i.test(x) ? x : d;
  };
  const col = {
    bg: c("--background", "#FAF7F2"),
    fg: c("--foreground", "#1B1B1B"),
    card: c("--card", "#FFFFFF"),
    primary: c("--primary", "#183B2B"),
    primaryFg: c("--primary-foreground", "#FFFFFF"),
    muted: c("--muted-foreground", "#6B6B6B"),
    border: c("--border", "#DDDDDD"),
  };
  const phoneUrl = `${origin}/kiosk/${p.code}?guest=1`;
  const qr = await qrSvg(phoneUrl);
  const tz = p.timezone ?? "Europe/London";
  const boot = {
    code: p.code,
    version: APP_VERSION,
    phoneUrl,
    shortUrl: phoneUrl.replace(/^https?:\/\//, ""),
    offset: zoneOffsetMinutes(tz),
    serverNow: Date.now(),
    words: words(p.name),
  };
  const logo = p.theme.logoUrl
    ? `<img id="logo" src="${esc(p.theme.logoUrl)}" alt="">`
    : `<span id="logo" class="initial">${esc((p.name.trim()[0] ?? "").toUpperCase())}</span>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="robots" content="noindex">
<title>${esc(p.name)}</title>
<style>
*{-webkit-box-sizing:border-box;box-sizing:border-box}
html,body{margin:0;padding:0;height:100%;overflow:hidden;background:${col.bg};color:${col.fg};font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:rgba(0,0,0,0)}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;-webkit-appearance:none}
#hd{position:absolute;top:0;left:0;right:0;height:72px;padding:12px 20px;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center}
#logo{width:48px;height:48px;border-radius:12px;margin-right:14px;-webkit-flex-shrink:0;flex-shrink:0}
#logo.initial{display:block;background:${col.primary};color:${col.primaryFg};font-size:26px;line-height:48px;text-align:center;font-weight:bold}
#nm{-webkit-box-flex:1;-webkit-flex:1;flex:1;font-size:22px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#clk{font-size:30px;font-weight:600;margin:0 12px}
.icon{width:56px;height:56px;border-radius:14px;color:${col.muted};display:block}
.icon svg{width:30px;height:30px;display:block;margin:13px}
#main{position:absolute;top:72px;left:0;right:0;bottom:40px;padding:8px 20px}
.welcome{height:100%;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center}
.welcome .txt{-webkit-box-flex:1;-webkit-flex:1;flex:1;padding-right:32px}
.welcome h1{font-size:46px;line-height:1.1;margin:0 0 18px}
.welcome p{font-size:24px;line-height:1.35;margin:0 0 14px;color:${col.fg}}
.welcome .url{font-size:20px;color:${col.muted};word-break:break-all}
.qr{width:300px;height:300px;background:#fff;padding:10px;border-radius:16px;-webkit-flex-shrink:0;flex-shrink:0}
.qr svg{width:100%;height:100%;display:block}
.big{display:inline-block;min-height:72px;padding:18px 36px;border-radius:40px;background:${col.primary};color:${col.primaryFg};font-size:26px;font-weight:bold}
.cards{height:100%;background:${col.primary};color:${col.primaryFg};border-radius:20px;padding:12px;position:relative}
.cards .top{height:44px;font-size:24px;font-weight:bold;padding:4px 8px;position:relative}
.cards .top .pg{position:absolute;right:8px;top:8px;font-size:18px;font-weight:normal}
.grid{position:absolute;top:56px;left:12px;right:12px;bottom:12px}
.card{position:absolute;padding:6px}
.card .in{height:100%;border-radius:18px;border:5px solid;padding:16px;overflow:hidden;position:relative}
.card .nm{font-weight:800;line-height:1.05;margin:0 0 6px}
.card .msg{line-height:1.25;margin:0 0 6px}
.card .meta{opacity:.85}
.card .go{position:absolute;left:14px;right:14px;bottom:14px;min-height:56px;border-radius:36px;font-weight:bold;font-size:20px;border:4px solid;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 10px}
#corner{position:absolute;left:8px;bottom:4px;height:36px;font-size:14px;color:${col.muted};display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;z-index:50}
#corner button{height:36px;padding:0 8px;color:${col.muted}}
#fs svg{width:18px;height:18px;display:block}
#dot{display:none;width:11px;height:11px;border-radius:6px;background:#D11;margin-left:6px;vertical-align:middle}
#lbl b{color:${col.fg}}
#upd{display:none;position:absolute;left:16px;bottom:56px;z-index:60}
#ov{display:none;position:absolute;top:0;left:0;right:0;bottom:0;z-index:40;background:rgba(0,0,0,.45)}
.panel{position:absolute;left:50%;top:50%;width:640px;max-width:92%;margin-left:-320px;-webkit-transform:translateY(-50%);transform:translateY(-50%);background:${col.card};color:${col.fg};border-radius:24px;padding:28px;max-height:90%;overflow:auto;-webkit-overflow-scrolling:touch}
.panel h2{font-size:30px;margin:0 0 10px}
.panel p{font-size:20px;margin:0 0 12px;line-height:1.35}
.panel .qr{margin:10px auto;width:260px;height:260px}
.row{display:block;width:100%;text-align:left;border:3px solid ${col.border};border-radius:14px;padding:12px 14px 12px 64px;margin:0 0 8px;position:relative;min-height:66px;background:${col.card}}
.row.on{border-color:${col.primary}}
.row .box{position:absolute;left:16px;top:50%;margin-top:-16px;width:32px;height:32px;border-radius:8px;border:3px solid ${col.muted};color:${col.primaryFg};font-size:22px;line-height:26px;text-align:center;font-weight:bold}
.row.on .box{background:${col.primary};border-color:${col.primary}}
.row .who{display:block;font-size:21px;font-weight:600}
.row .when{display:block;font-size:16px;color:${col.muted}}
.grp{font-size:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${col.muted};margin:14px 0 8px}
.btns{margin-top:16px;overflow:hidden}
.btns button{float:left;width:48%;min-height:64px;border-radius:16px;font-size:22px;font-weight:bold}
.btns .sec{border:2px solid ${col.border}}
.btns .pri{float:right;background:${col.primary};color:${col.primaryFg}}
#saver{display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:#000;z-index:70}
#saver span{position:absolute;color:#555;font-size:120px;font-weight:200}
#saverdim{position:absolute;top:0;left:0;right:0;bottom:0;background:#000;opacity:0}
#saverqr{display:none;position:absolute;width:180px;height:180px;background:#fff;padding:8px;border-radius:12px}
#saverqr svg{width:100%;height:100%;display:block}
#camon{display:none;position:absolute;left:12px;top:12px;z-index:80;background:#000;color:#fff;border-radius:20px;padding:8px 14px;font-size:15px}
#net{display:none;position:absolute;right:12px;bottom:8px;font-size:14px;color:#B33;z-index:55}
@media (max-width:820px){.welcome h1{font-size:36px}.qr{width:240px;height:240px}.welcome p{font-size:20px}}
@media (orientation:portrait){.welcome{display:block;padding-top:24px;text-align:center}.welcome .txt{padding:0 0 24px}.qr{margin:0 auto}}
</style>
</head>
<body>
<div id="hd">${logo}<span id="nm">${esc(p.name)}</span><span id="clk"></span><button id="bell" class="icon" style="display:none" aria-label="${esc(copy.bellTitle)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></button></div>
<div id="main"><div class="welcome"><div class="txt"><h1>${esc(copy.welcome(p.name))}</h1><p>${esc(copy.scan)}</p><p class="url">${esc(boot.shortUrl)}</p></div><div class="qr">${qr}</div></div></div>
<div id="corner"><button id="fs" style="display:none" aria-label="Full screen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button><button id="ver"><span id="lbl"></span>v${esc(APP_VERSION)}<span id="dot"></span></button></div>
<button id="upd" class="big"></button>
<div id="ov"></div>
<div id="saver"><div id="saverdim"></div><span></span><div id="saverqr"></div></div>
<div id="camon">${esc(copy.cameraOn)}</div>
<div id="net"></div>
<script>window.__LITE=${scriptJson(boot)};window.__LITE_QR=${scriptJson(qr)};</script>
<script src="/kiosk-lite.js?v=${esc(APP_VERSION)}"></script>
</body>
</html>`;
}

/** What the old tablet learns each time it checks in. */
export async function liteState(
  code: string,
  body: {
    device?: string | undefined;
    detected?: boolean | undefined;
    screen?:
      | {
          view: "start" | "cards" | "welcome" | "saver" | "night" | "blank" | "checkin";
          lite?: boolean | undefined;
          fullscreen?: boolean | undefined;
          camera?: boolean | undefined;
        }
      | undefined;
  },
  userAgent: string,
) {
  const { kioskTablet } = await import("./kiosk-devices.functions");
  const { kioskGoodbyes } = await import("./goodbye.functions");
  const { kioskWelcome } = await import("./kiosk.functions");
  const device = body.device && body.device.length >= 24 ? body.device : undefined;
  const tablet = await kioskTablet({
    data: {
      code,
      ...(device ? { device } : {}),
      version: APP_VERSION,
      compat: { detected: body.detected !== false, reason: browserLabel(userAgent) },
      ...(body.screen
        ? {
            screen: {
              view: body.screen.view,
              lite: true,
              fullscreen: body.screen.fullscreen === true,
              ...(typeof body.screen.camera === "boolean" ? { camera: body.screen.camera } : {}),
            },
          }
        : {}),
    },
  });
  const token = tablet.device ?? device;
  const [cards, welcome, rest] = await Promise.all([
    kioskGoodbyes({ data: { code, ...(token ? { device: token } : {}) } }),
    kioskWelcome({ data: { code, ...(token ? { device: token } : {}) } }),
    liteRest(code),
  ]);
  return {
    version: APP_VERSION,
    serverNow: Date.now(),
    tablet: {
      device: tablet.device,
      status: tablet.status,
      pairCode: tablet.pairCode,
      number: tablet.number,
      label: tablet.label,
      compat: tablet.compat,
      compatChosen: tablet.compatChosen,
      cardPicker: tablet.cardPicker,
      update: tablet.update,
      // The host is looking through its camera until then (only where the browser can share it).
      watchUntil: tablet.watchUntil,
    },
    rest,
    cards: {
      ...cards,
      // Plain colours for each kind: the card, its text and its outline.
      look: {
        in: {
          bg: cards.colours.in,
          ink: cardInk(cards.colours.in),
          edge: cardEdge(cards.colours.in),
        },
        out: {
          bg: cards.colours.out,
          ink: cardInk(cards.colours.out),
          edge: cardEdge(cards.colours.out),
        },
      },
    },
    welcome: welcome
      ? { headline: welcome.headline, body: welcome.body, version: welcome.version }
      : null,
  };
}

/**
 * The screensaver as the full kiosk has it, worked out here for the old
 * tablet: what shows at rest now (the host's night light in its colours and
 * brightness, the clock, or the screen off, by quiet hours), the clock's
 * brightness, whether the phone QR shows, and the timings.
 */
export async function liteRest(code: string) {
  const { kioskSaverLook } = await import("./kiosk.functions");
  const { restNow, NIGHT_PALETTES, deepen, speedFactor } = await import("./kiosk-rest");
  const { quietNow } = await import("./kiosk-clock");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [look, prop] = await Promise.all([
    kioskSaverLook({ data: { code } }),
    (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
          };
        };
      }
    )
      .from("properties")
      .select("timezone, quiet_hours_start, quiet_hours_end")
      .eq("short_code", code)
      .maybeSingle()
      .then(
        (r) =>
          r.data as {
            timezone: string | null;
            quiet_hours_start: string | null;
            quiet_hours_end: string | null;
          } | null,
      ),
  ]);
  const tz = prop?.timezone ?? "Europe/London";
  const quiet = quietNow(
    new Date(),
    tz,
    (prop?.quiet_hours_start ?? "22:00").slice(0, 5),
    (prop?.quiet_hours_end ?? "07:00").slice(0, 5),
  ).active;
  return {
    show: restNow(look.rest, quiet),
    nightColours: NIGHT_PALETTES[look.rest.palette].map((c) => deepen(c, look.night.depth)),
    nightBrightness: look.night.brightness,
    /** Seconds each colour takes to drift into the next. */
    nightSeconds: Math.round(12 * speedFactor(look.rest.speed)),
    clockBrightness: look.look.brightness,
    qr: look.rest.clockQr,
    saverMinutes: look.defaults.saverMinutes,
    resetMinutes: look.defaults.resetMinutes,
  };
}
