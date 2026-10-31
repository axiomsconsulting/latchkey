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
import { PILL, googleFontLinks, themeVars } from "@/lib/theme";
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
    orPhoneShort: copy.orPhoneShort,
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
  const t = p.theme;
  const v = themeVars(t);
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
    accent: c("--accent", "#C8643B"),
    muted: c("--muted-foreground", "#6B6B6B"),
    border: c("--border", "#DDDDDD"),
    secondary: c("--secondary", "#EEEEEE"),
  };
  // The button colour, corners and shapes the property's theme sets.
  const btn = t.buttonColour === "accent" ? col.accent : col.primary;
  const btnFg = t.buttonColour === "accent" ? c("--accent-foreground", "#FFFFFF") : col.primaryFg;
  const btnRadius = t.buttonRadius >= PILL ? "999px" : `${Math.round(t.buttonRadius * 16)}px`;
  const radius = `${Math.round(t.radius * 16)}px`;
  const bigRadius = `${Math.round(t.radius * 24)}px`;
  const headingFamily = `"${t.customFontName ?? t.headingFont}", Georgia, "Times New Roman", serif`;
  const bodyFamily = `"${t.bodyFont}", "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const headingCase =
    t.headingCase === "upper"
      ? "text-transform:uppercase;"
      : t.headingCase === "smallcaps"
        ? "font-variant:small-caps;"
        : "";
  const heading = `font-family:${headingFamily};font-weight:${t.headingWeight};letter-spacing:${t.headingTracking}em;${headingCase}`;
  const btnCase = t.buttonCase === "upper" ? "text-transform:uppercase;letter-spacing:.06em;" : "";
  const fonts = googleFontLinks(t)
    .map((l) => `<link rel="stylesheet" href="${esc(l.href)}">`)
    .join("");
  const customFace =
    t.customFontUrl && t.customFontName
      ? `@font-face{font-family:"${t.customFontName.replace(/"/g, "")}";src:url("${t.customFontUrl.replace(/"/g, "")}")}`
      : "";
  const pageBg =
    t.backgroundStyle === "gradient"
      ? `background:${col.bg};background-image:-webkit-linear-gradient(top,${col.bg},${col.secondary});background-image:linear-gradient(to bottom,${col.bg},${col.secondary});`
      : `background:${col.bg};`;
  const band = t.headerBand;
  const phoneUrl = `${origin}/kiosk/${p.code}?guest=1`;
  const qr = await qrSvg(phoneUrl);
  const tz = p.timezone ?? "Europe/London";
  const centred = t.layout === "centred";
  const title = (t.welcomeTitle || "Welcome to {property}").replace(/\{property\}/g, p.name);
  // The start screen, as on the full kiosk: the welcome, a big Check in, and the phone QR.
  const homeHtml =
    `<div class="home${centred ? " centred" : ""}"><div class="hometxt">` +
    (t.eyebrow ? `<p class="eyebrow">${esc(t.eyebrow)}</p>` : "") +
    `<h1>${esc(title)}</h1>` +
    `<p class="lead">${esc(t.welcomeBody || copy.scan)}</p>` +
    `<button class="big" data-act="checkin">${esc(copy.checkIn)}</button>` +
    `</div><div class="phone"><div class="qr">${qr}</div><p>${esc(copy.orPhoneShort)}</p></div></div>`;
  const boot = {
    code: p.code,
    version: APP_VERSION,
    phoneUrl,
    shortUrl: phoneUrl.replace(/^https?:\/\//, ""),
    offset: zoneOffsetMinutes(tz),
    serverNow: Date.now(),
    words: words(p.name),
    homeHtml,
  };
  const logo = t.logoUrl
    ? `<img id="logo" src="${esc(t.logoUrl)}" alt="">`
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
${fonts}
<style>
*{-webkit-box-sizing:border-box;box-sizing:border-box}
${customFace}
html,body{margin:0;padding:0;height:100%;overflow:hidden;${pageBg}color:${col.fg};font-family:${bodyFamily};-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:rgba(0,0,0,0)}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;-webkit-appearance:none}
#hd{position:absolute;top:0;left:0;right:0;height:80px;padding:12px 24px;${band ? `background:${col.primary};color:${col.primaryFg};` : ""}display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center}
#logo{height:52px;max-width:160px;margin-right:16px;-webkit-flex-shrink:0;flex-shrink:0}
#logo.initial{display:block;width:52px;border-radius:${radius};background:${col.primary};color:${col.primaryFg};font-size:28px;line-height:52px;text-align:center;${heading}}
#nm{-webkit-box-flex:1;-webkit-flex:1;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#nm b{display:block;font-size:24px;font-weight:normal;${heading}overflow:hidden;text-overflow:ellipsis}
#nm small{display:block;font-size:12px;letter-spacing:.25em;text-transform:uppercase;opacity:.7}
#clk{font-size:34px;margin:0 12px;${heading}}
.icon{width:56px;height:56px;border-radius:${radius};color:${band ? col.primaryFg : col.muted};display:block}
.icon svg{width:30px;height:30px;display:block;margin:13px}
#main{position:absolute;top:80px;left:0;right:0;bottom:40px;padding:8px 24px}
.home{height:100%;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center}
.hometxt{-webkit-box-flex:1;-webkit-flex:1;flex:1;padding-right:40px}
.home h1{font-size:54px;line-height:1.1;margin:0 0 18px;${heading}}
.home .eyebrow{font-size:15px;letter-spacing:.25em;text-transform:uppercase;color:${col.primary};margin:0 0 12px}
.home .lead{font-size:24px;line-height:1.4;margin:0 0 30px;color:${col.muted}}
.home .phone{width:220px;text-align:center;-webkit-flex-shrink:0;flex-shrink:0}
.home .phone .qr{width:200px;height:200px;margin:0 auto 10px}
.home .phone p{font-size:16px;color:${col.muted};margin:0}
.home.centred{-webkit-box-orient:vertical;-webkit-flex-direction:column;flex-direction:column;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;text-align:center}
.home.centred .hometxt{-webkit-box-flex:0;-webkit-flex:none;flex:none;padding:0;max-width:820px}
.home.centred .phone{margin-top:28px;width:auto;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center}
.home.centred .phone .qr{width:120px;height:120px;margin:0 16px 0 0;padding:6px}
.hostwel{position:absolute;top:0;left:0;right:0;bottom:0;background:${col.primary};color:${col.primaryFg};display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-flex-direction:column;flex-direction:column;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;-webkit-box-align:center;-webkit-align-items:center;align-items:center;text-align:center;padding:40px;z-index:30}
.hostwel h1{font-size:64px;line-height:1.1;margin:0 0 20px;${heading}}
.hostwel p{font-size:28px;line-height:1.35;margin:0 0 30px;max-width:900px}
.hostwel .big{background:${col.primaryFg};color:${col.primary}}
.hostwel .small{font-size:18px;opacity:.85;margin-top:24px}
.qr{width:300px;height:300px;background:#fff;padding:10px;border-radius:${radius};-webkit-flex-shrink:0;flex-shrink:0}
.qr svg{width:100%;height:100%;display:block}
.big{display:inline-block;min-height:76px;min-width:280px;padding:20px 44px;border-radius:${btnRadius};background:${btn};color:${btnFg};font-size:28px;font-weight:bold;${btnCase}}
.cards{height:100%;background:${col.primary};color:${col.primaryFg};border-radius:${bigRadius};padding:12px;position:relative}
.cards .top{height:44px;font-size:26px;padding:4px 8px;position:relative;${heading}}
.cards .top .pg{position:absolute;right:8px;top:8px;font-size:18px;font-weight:normal}
.grid{position:absolute;top:56px;left:12px;right:12px;bottom:12px}
.card{position:absolute;padding:6px}
.card .in{height:100%;border-radius:${bigRadius};border:5px solid;padding:16px;overflow:hidden;position:relative}
.card .nm{line-height:1.05;margin:0 0 6px;${heading}font-weight:700}
.card .msg{line-height:1.25;margin:0 0 6px}
.card .meta{opacity:.85}
.card .go{position:absolute;left:14px;right:14px;bottom:14px;min-height:56px;border-radius:${btnRadius};${btnCase}font-weight:bold;font-size:20px;border:4px solid;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 10px}
#corner{position:absolute;left:8px;bottom:4px;height:36px;font-size:14px;color:${col.muted};display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;z-index:50}
#corner button{height:36px;padding:0 8px;color:${col.muted}}
#fs svg{width:18px;height:18px;display:block}
#dot{display:none;width:11px;height:11px;border-radius:6px;background:#D11;margin-left:6px;vertical-align:middle}
#lbl b{color:${col.fg}}
#upd{display:none;position:absolute;left:16px;bottom:56px;z-index:60}
#ov{display:none;position:absolute;top:0;left:0;right:0;bottom:0;z-index:40;background:rgba(0,0,0,.45)}
.panel{position:absolute;left:50%;top:50%;width:640px;max-width:92%;margin-left:-320px;-webkit-transform:translateY(-50%);transform:translateY(-50%);background:${col.card};color:${col.fg};border-radius:${bigRadius};padding:28px;max-height:90%;overflow:auto;-webkit-overflow-scrolling:touch}
.panel h2{font-size:32px;margin:0 0 10px;${heading}}
.panel p{font-size:20px;margin:0 0 12px;line-height:1.35}
.panel .qr{margin:10px auto;width:260px;height:260px}
.row{display:block;width:100%;text-align:left;border:3px solid ${col.border};border-radius:${radius};padding:12px 14px 12px 64px;margin:0 0 8px;position:relative;min-height:66px;background:${col.card}}
.row.on{border-color:${col.primary}}
.row .box{position:absolute;left:16px;top:50%;margin-top:-16px;width:32px;height:32px;border-radius:8px;border:3px solid ${col.muted};color:${col.primaryFg};font-size:22px;line-height:26px;text-align:center;font-weight:bold}
.row.on .box{background:${col.primary};border-color:${col.primary}}
.row .who{display:block;font-size:21px;font-weight:600}
.row .when{display:block;font-size:16px;color:${col.muted}}
.grp{font-size:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${col.muted};margin:14px 0 8px}
.btns{margin-top:16px;overflow:hidden}
.btns button{float:left;width:48%;min-height:64px;border-radius:${btnRadius};font-size:22px;font-weight:bold;${btnCase}}
.btns .sec{border:2px solid ${col.border}}
.btns .pri{float:right;background:${btn};color:${btnFg}}
#saver{display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:#000;z-index:70}
#saver span{position:absolute;color:#555;font-size:120px;font-weight:200}
#saverdim{position:absolute;top:0;left:0;right:0;bottom:0;background:#000;opacity:0}
#saverqr{display:none;position:absolute;width:180px;height:180px;background:#fff;padding:8px;border-radius:12px}
#saverqr svg{width:100%;height:100%;display:block}
#camon{display:none;position:absolute;left:12px;top:12px;z-index:80;background:#000;color:#fff;border-radius:20px;padding:8px 14px;font-size:15px}
#net{display:none;position:absolute;right:12px;bottom:8px;font-size:14px;color:#B33;z-index:55}
@media (max-width:820px){.home h1{font-size:40px}.home .lead{font-size:20px}.hostwel h1{font-size:46px}}
@media (orientation:portrait){.home{-webkit-box-orient:vertical;-webkit-flex-direction:column;flex-direction:column;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;text-align:center}.hometxt{-webkit-box-flex:0;-webkit-flex:none;flex:none;padding:0}.home .phone{margin-top:32px}}
</style>
</head>
<body>
<div id="hd">${logo}<span id="nm"><b>${esc(p.name)}</b>${t.subname ? `<small>${esc(t.subname)}</small>` : ""}</span><span id="clk"></span><button id="bell" class="icon" style="display:none" aria-label="${esc(copy.bellTitle)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></button></div>
<div id="main">${homeHtml}</div>
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
