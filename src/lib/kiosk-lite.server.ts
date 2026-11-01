/**
 * The compatible kiosk for older tablets (/lite/<code>, src/lib/kiosk-compat.ts):
 * a plain page (no app bundle) whose script, public/kiosk-lite.js, is ES5 and
 * talks to /api/public/kiosk-lite/<code>. Both reuse the full kiosk's server
 * functions (tablet check-in, cards, welcome, express check-out, the bell),
 * so the rules are the same; only the screen is simpler. Check-in itself
 * happens on the guest's own phone, by QR code (old tablets have no camera
 * access in the browser).
 */
import { guest as guestCopy, kioskLite as copy } from "@/content/copy";
import { brandName } from "@/lib/brand";
import { APP_VERSION } from "@/lib/app-version";
import { cardEdge, cardInk } from "@/lib/checkout-goodbye";
import { browserLabel, modeKey } from "@/lib/kiosk-compat";
import { expressCards, expressPage } from "@/lib/kiosk-xl";
import { PILL, googleFontLinks, mix, readableOn, themeVars, welcomeTitle } from "@/lib/theme";
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
    phoneFirst: copy.phoneFirst,
    orTablet: copy.orTablet,
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
  /** The property's usual times ("Rooms are ready from 15:00…" under Check in). */
  checkInFrom?: string | null | undefined;
  checkOutBy?: string | null | undefined;
  /** XL (bold full-screen cards in the card colours) or standard (kiosk-xl.ts). */
  kioskLook?:
    { look: "standard" | "xl"; cardIn: string | null; cardOut: string | null } | undefined;
};

/** A hex colour with see-through (old browsers have rgba, not colour mixing). */
export function rgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Flexible boxes for every old engine: the 2009 -webkit-box, the prefixed and the standard. */
const FLEX = "display:-webkit-box;display:-webkit-flex;display:-ms-flexbox;display:flex;";
const ROW_CENTER =
  FLEX +
  "-webkit-box-align:center;-webkit-align-items:center;-ms-flex-align:center;align-items:center;";
const COL =
  FLEX +
  "-webkit-box-orient:vertical;-webkit-flex-direction:column;-ms-flex-direction:column;flex-direction:column;";
const GROW = "-webkit-box-flex:1;-webkit-flex:1 1 0%;-ms-flex:1 1 0%;flex:1 1 0%;min-width:0;";
const NOSHRINK = "-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;";
const CENTER_JUSTIFY =
  "-webkit-box-pack:center;-webkit-justify-content:center;-ms-flex-pack:center;justify-content:center;";

/**
 * The page itself, at the level the tablet runs (html class lv-enhanced or
 * lv-lite, set before anything draws from what the host chose or what the
 * browser can do). Enhanced mirrors the full kiosk: the theme's backdrop
 * art and frame, its fonts, the header with logo, clock, date, bell and day
 * icon, the welcome card with the property's mark, words and features, the
 * phone QR panel and the footer. Lite drops the pictures, fonts and
 * movement for the slowest tablets. Colours are plain values throughout
 * (no CSS variables, colour mixing or layers).
 */
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
    mutedBg: c("--muted", "#F1F1F1"),
    border: c("--border", "#DDDDDD"),
    secondary: c("--secondary", "#EEEEEE"),
    cardBorder: c("--card-border", "transparent"),
    icon: c("--icon", "#183B2B"),
  };
  const { liteIcons, liteLogo, liteArt, liteFlourish, liteFeatureIcon } =
    await import("./kiosk-lite-art.server");
  const icons = liteIcons(t, col.accent);
  // The button as the theme draws it: its colour, fill (solid, gradient or outline), corners and case.
  const btnBase = t.buttonColour === "accent" ? col.accent : col.primary;
  const btn = t.buttonFill === "outline" ? "transparent" : btnBase;
  const btnFg = t.buttonFill === "outline" ? btnBase : readableOn(btnBase);
  const btnImage =
    t.buttonFill === "gradient"
      ? `background-image:-webkit-linear-gradient(top,${mix(btnBase, "#ffffff", 0.28)} 0%,${btnBase} 55%,${mix(btnBase, "#000000", 0.12)} 100%);background-image:linear-gradient(180deg,${mix(btnBase, "#ffffff", 0.28)} 0%,${btnBase} 55%,${mix(btnBase, "#000000", 0.12)} 100%);`
      : "";
  const btnBorder = t.buttonFill === "outline" ? btnBase : "transparent";
  const btnRadius = t.buttonRadius >= PILL ? "999px" : `${Math.round(t.buttonRadius * 16)}px`;
  const radius = `${Math.round(t.radius * 16)}px`;
  const bigRadius = `${Math.round(t.radius * 24)}px`;
  const cardShadow =
    t.cardStyle === "shadow"
      ? `box-shadow:0 1px 2px ${rgba(col.fg, 0.05)},0 8px 24px ${rgba(col.fg, 0.08)};`
      : "";
  const headingFamily = `"${t.customFontName ?? t.headingFont}", Georgia, "Times New Roman", serif`;
  const bodyFamily = `"${t.bodyFont}", "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const headingCase =
    t.headingCase === "upper"
      ? "text-transform:uppercase;"
      : t.headingCase === "smallcaps"
        ? "font-variant:small-caps;"
        : "";
  const heading = `font-family:${headingFamily};font-weight:${t.headingWeight};letter-spacing:${t.headingTracking}em;${headingCase}`;
  const display = `font-family:${headingFamily};`;
  const btnCase = t.buttonCase === "upper" ? "text-transform:uppercase;letter-spacing:.14em;" : "";
  // Fonts load only at the enhanced level (written by the level script below).
  const fonts = googleFontLinks(t)
    .map((l) => `<link rel="stylesheet" href="${esc(l.href)}">`)
    .join("");
  const customFace =
    t.customFontUrl && t.customFontName
      ? `@font-face{font-family:"${t.customFontName.replace(/"/g, "")}";src:url("${t.customFontUrl.replace(/"/g, "")}")}`
      : "";
  const gradientBg =
    t.backgroundStyle === "gradient"
      ? `background-image:-webkit-radial-gradient(50% 0%,120% 90%,${mix(col.bg, col.fg, 0.06)} 0%,${col.bg} 60%,${mix(col.bg, "#000000", 0.08)} 100%);background-image:radial-gradient(120% 90% at 50% 0%,${mix(col.bg, col.fg, 0.06)} 0%,${col.bg} 60%,${mix(col.bg, "#000000", 0.08)} 100%);`
      : "";
  const band = t.headerBand;
  const phoneUrl = `${origin}/kiosk/${p.code}?guest=1`;
  const qr = await qrSvg(phoneUrl);
  const tz = p.timezone ?? "Europe/London";
  const centred = t.layout === "centred";
  const title = welcomeTitle(t, p.name, guestCopy.welcomeTo(p.name));
  const logo = liteLogo(t, p.name, col.accent);
  // A drawn mark stands on its own in the main colour on a centred welcome, like a crest (BrandBlock).
  const crest = !t.logoUrl && t.logoPreset !== "monogram";

  // The backdrop: the theme's line art in its accent colour, faint, and its frame.
  const art = liteArt(t, col.accent);
  const flourish = t.frame === "ornate" ? liteFlourish(col.accent) : "";
  const backdrop =
    `<div id="bd" aria-hidden="true">` +
    (art
      ? t.artwork === "palace"
        ? `<div class="art palace l">${art}</div><div class="art palace r">${art}</div>`
        : `<div class="art wide">${art}</div>`
      : "") +
    (t.frame !== "none"
      ? `<div class="frame"><div class="f1"></div>` +
        (t.frame === "ornate"
          ? `<div class="f2"></div><span class="fl tl">${flourish}</span><span class="fl tr">${flourish}</span><span class="fl bl">${flourish}</span><span class="fl br">${flourish}</span>`
          : "") +
        `</div>`
      : "") +
    `</div>`;
  const [noteL, noteR] = t.sideNotes;
  const sideNote = (text: string, side: "l" | "r") =>
    text
      ? `<div class="sn ${side}">${text
          .split("·")
          .map((x) => `<span>${esc(x.trim())}</span>`)
          .join("")}<i></i></div>`
      : "";
  const sideNotes = sideNote(noteL ?? "", "l") + sideNote(noteR ?? "", "r");

  // The welcome, as CheckInFlow draws it: the card with the property's mark and words, and the phone panel.
  const brandBlock = centred
    ? `<div class="bb"><span class="lm${crest ? " crest" : ""}">${logo}</span><p class="bbn">${esc(p.name)}</p>` +
      (t.subname ? `<p class="bbs"><i></i><span>${esc(t.subname)}</span><i></i></p>` : "") +
      `</div>`
    : "";
  const features = t.features.length
    ? `<ul class="feat">${t.features
        .map(
          (f) =>
            `<li><span class="fi ${t.iconFrame}">${liteFeatureIcon(t, f.icon, col.accent)}</span><span>${esc(f.text)}</span></li>`,
        )
        .join("")}</ul>`
    : "";
  const stayWindow =
    p.checkInFrom && p.checkOutBy
      ? `<p class="win">${esc(guestCopy.stayWindow(p.checkInFrom, p.checkOutBy))}</p>`
      : "";
  const homeHtml =
    `<div class="home${centred ? " centred" : ""}"><div class="wcard"><div class="wc">` +
    brandBlock +
    (t.eyebrow ? `<p class="eyebrow">${esc(t.eyebrow)}</p>` : "") +
    `<h1>${esc(title)}</h1>` +
    (centred ? `<p class="dia"><i></i><b></b><i></i></p>` : "") +
    `<p class="lead">${esc(t.welcomeBody || guestCopy.letsCheckIn)}</p>` +
    features +
    `<button class="big" data-act="checkin">${esc(guestCopy.startCta)}</button>` +
    stayWindow +
    `</div></div><div class="qrp"><span class="pi">${icons.phone}</span><h2>${esc(guestCopy.kioskQrTitle)}</h2><div class="qr">${qr}</div><p>${esc(guestCopy.kioskQrBody)}</p></div></div>`;

  // Express ("xl"): the deepened main colour, the welcome and phone panel as bold cards, shapes from the theme (kiosk-xl.ts).
  const xl = p.kioskLook?.look === "xl" ? p.kioskLook : null;
  const xlCard = (bg: string) => {
    const ink = cardInk(bg);
    return { bg, ink, edge: cardEdge(bg), muted: mix(ink, bg, 0.25) };
  };
  const cards = xl ? expressCards(t, xl.cardIn, xl.cardOut) : null;
  const page = expressPage(col.primary, t.background);
  const pageInk = cardInk(page);
  const ci = cards ? xlCard(cards.cardIn) : null;
  const co = cards ? xlCard(cards.cardOut) : null;
  // Old browsers have no CSS variables: the theme's shapes written in as plain values (px for old WebKit).
  const px = (rem: number) => Math.round(rem * 16);
  const cardR = t.radius <= 0 ? 0 : Math.max(px(t.radius * 1.6), 14);
  const btnR = t.buttonRadius >= PILL ? 999 : px(t.buttonRadius * 1.5);
  const edgeW = t.cardStyle === "flat" ? 0 : t.cardStyle === "outline" ? 6 : 4;
  const shadow =
    t.cardStyle === "flat"
      ? "none"
      : t.cardStyle === "shadow"
        ? "0 16px 40px rgba(0,0,0,.34)"
        : "0 8px 20px rgba(0,0,0,.2)";
  const headW = Math.min(900, Math.max(700, Math.round(t.headingWeight / 100) * 100 + 200));
  const headCase =
    (t.headingCase === "upper" ? "text-transform:uppercase;" : "") +
    (t.headingCase === "smallcaps" ? "font-variant:small-caps;" : "") +
    `letter-spacing:${Math.min(0.3, Math.max(0, t.headingTracking))}em;`;
  const xBtnCase = t.buttonCase === "upper" ? "text-transform:uppercase;letter-spacing:.06em;" : "";
  const outlineBtn = t.buttonFill === "outline";
  const xBtn = (c: { bg: string; ink: string }) =>
    outlineBtn
      ? `background:transparent;background-image:none;color:${c.ink};border:3px solid ${c.ink};`
      : `background:${c.ink};background-image:none;color:${c.bg};border-color:${c.ink};`;
  const xlStyles =
    xl && ci && co
      ? `html,body{background-color:${page};background-image:none;color:${pageInk}}
#bd{color:${pageInk}}
#hd,#clk small,#nm small,.icon,#corner,#corner button,#ft{color:${pageInk}}
#ft{border-top-color:${rgba(pageInk, 0.3)}}
#ft b{color:${pageInk}}
#hd .lm>span{background:${pageInk};color:${page}}
#hd .lm>img{background:#fff;padding:4px}
#nm b{font-weight:${headW};${headCase}}
.wcard{background:${ci.bg};color:${ci.ink};border:${edgeW}px solid ${ci.edge};border-radius:${cardR}px;box-shadow:${shadow}}
.wc h1{font-weight:${headW};font-size:52px;line-height:1.05;${headCase}}
.lead,.win,.bbs{color:${ci.muted}}
.bbs i{background:${ci.muted}}
.eyebrow,.dia{color:${ci.ink}}
.dia i,.dia b{background:${ci.ink}}
.bb .lm.crest>span{color:${ci.ink}}
.fi{color:${ci.ink}}
.wcard .big{${xBtn(ci)}border-radius:${btnR}px;font-weight:700;${xBtnCase}box-shadow:0 6px 16px rgba(0,0,0,.22)}
.qrp{background:${co.bg};color:${co.ink};border:${edgeW}px solid ${co.edge};border-radius:${cardR}px;box-shadow:${shadow}}
.qrp .pi{color:${co.ink}}
.qrp h2{font-weight:${headW};${headCase}}
.qrp p{color:${co.muted}}
.qrp .qr{border-radius:${t.radius <= 0 ? 0 : Math.max(px(t.radius), 10)}px;padding:10px;box-shadow:0 4px 12px rgba(0,0,0,.18)}
.panel .big,.btns .pri{border-radius:${btnR}px;font-weight:700;${xBtnCase}}
.btns .sec{border-radius:${btnR}px;${xBtnCase}}
.cards{background:${page};color:${pageInk};border-radius:0;box-shadow:none}
.cards .top{font-weight:${headW};${headCase}}
.card .in{border-radius:${cardR}px;border-width:${Math.max(edgeW, 3)}px;box-shadow:${shadow}}
.card .nm{font-weight:${headW};${headCase}}
.card .go{border-radius:${btnR}px;${xBtnCase}}
.hostwel .lm{background:#fff;border-radius:${Math.max(px(t.radius), 6)}px}
#hd .icon svg,.fi svg,.pi svg{stroke-width:${Math.min(3, Math.max(2.25, t.iconStroke + 0.5))}}
`
      : "";

  const footer =
    t.tagline || t.poweredBy
      ? `<div id="ft"><span class="tg">${esc(t.tagline)}</span>` +
        (t.poweredBy ? `<span class="pb">Powered by <b>${esc(brandName())}</b></span>` : "") +
        `</div>`
      : "";

  const boot = {
    code: p.code,
    version: APP_VERSION,
    phoneUrl,
    shortUrl: phoneUrl.replace(/^https?:\/\//, ""),
    offset: zoneOffsetMinutes(tz),
    serverNow: Date.now(),
    words: words(p.name),
    homeHtml,
    centred,
    icons,
    // Express: the cards in the theme's colours (kiosk-xl.ts), else the stored ones from each state call.
    xlCards:
      ci && co
        ? {
            in: { bg: ci.bg, ink: ci.ink, edge: ci.edge },
            out: { bg: co.bg, ink: co.ink, edge: co.edge },
          }
        : null,
    logo,
  };
  // Picks the level before anything draws: the host's choice kept on the tablet, else what the browser can do.
  const levelScript = `(function(){var m=null;try{m=localStorage.getItem(${scriptJson(modeKey(p.code))})}catch(e){}
var s=document.createElement("div").style;
var flex=("flexBasis" in s)||("webkitFlexBasis" in s)||("WebkitFlexBasis" in s);
var svg=!!(document.createElementNS&&document.createElementNS("http://www.w3.org/2000/svg","svg").createSVGRect);
var lv=m==="lite"||m==="enhanced"?m:(flex&&svg?"enhanced":"lite");
document.documentElement.className="lv-"+lv;window.__LV=lv;
if(lv==="enhanced")document.write(${scriptJson(fonts)});})();`;
  return `<!doctype html>
<html lang="en" class="lv-enhanced">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="robots" content="noindex">
<title>${esc(p.name)}</title>
<script>${levelScript}</script>
<style>
*{-webkit-box-sizing:border-box;box-sizing:border-box}
${customFace}
html,body{margin:0;padding:0;height:100%;overflow:hidden;background-color:${col.bg};color:${col.fg};font-family:${bodyFamily};-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:rgba(0,0,0,0);-webkit-text-size-adjust:100%}
.lv-enhanced body{${gradientBg}}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;-webkit-appearance:none;padding:0}
svg{overflow:visible}
p{margin:0}
#bd{position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;pointer-events:none;color:${col.accent}}
#bd .art{position:absolute;bottom:0;opacity:${t.artworkOpacity}}
#bd .art svg{width:100%;height:100%;display:block}
#bd .wide{left:0;width:60%;min-width:320px;height:26%;max-height:224px}
#bd .palace{width:22%;max-width:256px;height:70%;max-height:544px}
#bd .palace.l{left:0}
#bd .palace.r{right:0;-webkit-transform:scaleX(-1);transform:scaleX(-1)}
#bd .frame{position:absolute;top:10px;left:10px;right:10px;bottom:10px}
#bd .f1{position:absolute;top:0;left:0;right:0;bottom:0;border:1px solid ${rgba(col.accent, 0.65)}}
#bd .f2{position:absolute;top:6px;left:6px;right:6px;bottom:6px;border:1px solid ${rgba(col.accent, 0.35)}}
#bd .fl{position:absolute;width:40px;height:40px}
#bd .fl svg{width:40px;height:40px;display:block}
#bd .tl{left:0;top:0}
#bd .tr{right:0;top:0;-webkit-transform:scaleX(-1);transform:scaleX(-1)}
#bd .bl{left:0;bottom:0;-webkit-transform:scaleY(-1);transform:scaleY(-1)}
#bd .br{right:0;bottom:0;-webkit-transform:scale(-1,-1);transform:scale(-1,-1)}
.sn{display:none;position:absolute;top:96px;max-width:176px;font-size:12px;text-transform:uppercase;letter-spacing:.3em;line-height:1.7;color:${col.accent}}
.sn span{display:block}
.sn i{display:block;margin-top:12px;height:1px;width:48px;background:${col.accent};opacity:.6}
.sn.l{left:40px}
.sn.r{right:40px;text-align:right}
.sn.r i{margin-left:auto}
@media (min-width:1360px){.lv-enhanced .atwel .sn{display:block}}
#hd{position:absolute;top:0;left:0;right:0;height:96px;padding:18px 32px 0;${band ? `background:${col.primary};color:${col.primaryFg};padding-top:0;height:88px;` : ""}${ROW_CENTER}z-index:5}
#hdi{${ROW_CENTER}width:100%;max-width:1100px;margin:0 auto}
.lm{display:block;width:56px;height:56px;margin-right:14px;${NOSHRINK}}
.lm>svg{display:block;width:100%;height:100%}
.lm>img{display:block;width:100%;height:100%;border-radius:${radius};object-fit:contain}
.lm>span{${ROW_CENTER}${CENTER_JUSTIFY}width:100%;height:100%;border-radius:${bigRadius};background:${col.primary};color:${col.primaryFg};${display}font-size:24px;overflow:hidden}
.lm>span>svg{width:80%;height:80%;display:block}
.lm>span>svg[viewBox="0 0 48 48"]:only-child{width:100%;height:100%}
.lm.crest>span{background:none;color:${col.primary}}
#nm{${GROW}white-space:nowrap;overflow:hidden}
#nm b{display:block;font-size:25px;font-weight:normal;${display}overflow:hidden;text-overflow:ellipsis}
#nm small{display:block;font-size:12px;letter-spacing:.25em;text-transform:uppercase;color:${band ? col.primaryFg : col.muted};margin-top:3px;overflow:hidden;text-overflow:ellipsis}
.centred.atwel #nm{visibility:hidden}
#clk{text-align:right;margin:0 6px 0 12px;${display}line-height:1.2;${NOSHRINK}}
#clk b{display:block;font-size:25px;font-weight:normal}
#clk small{display:block;font-size:16px;white-space:nowrap;color:${band ? col.primaryFg : col.muted}}
#act{${ROW_CENTER}-webkit-box-pack:end;-webkit-justify-content:flex-end;justify-content:flex-end;width:132px;${NOSHRINK}}
.icon{display:block;width:58px;height:58px;margin-left:6px;border-radius:${radius};color:${band ? col.primaryFg : col.muted}}
.icon svg{display:block;width:34px;height:34px;margin:12px}
.icon:active{background:${col.mutedBg};color:${col.fg}}
#main{position:absolute;top:104px;left:0;right:0;bottom:56px;padding:0 32px}
.lv-enhanced #main>*{-webkit-animation:fadein .35s ease-out;animation:fadein .35s ease-out}
@-webkit-keyframes fadein{from{opacity:0}to{opacity:1}}
@keyframes fadein{from{opacity:0}to{opacity:1}}
.home{height:100%;max-width:1100px;margin:0 auto;${ROW_CENTER}}
.wcard{${GROW}background:${col.card};border:1px solid ${t.cardStyle === "flat" ? "transparent" : col.cardBorder};border-radius:${bigRadius};${cardShadow}padding:28px 40px;max-height:100%;overflow:hidden}
.wc{text-align:center}
.bb{margin:0 0 18px}
.bb .lm{width:72px;height:72px;margin:0 auto}
.bb .lm>span{font-size:30px}
.bbn{margin-top:12px;${display}text-transform:uppercase;letter-spacing:.18em;font-size:22px;font-weight:${t.headingWeight}}
.bbs{margin-top:6px;${ROW_CENTER}${CENTER_JUSTIFY}font-size:13px;text-transform:uppercase;letter-spacing:.3em;color:${col.muted}}
.bbs i{display:block;width:40px;height:1px;background:${col.muted};opacity:.5;margin:0 12px}
.eyebrow{margin-bottom:8px;font-size:14px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:${col.accent}}
.wc h1{font-size:44px;line-height:1.15;margin:0;${heading}}
.dia{${ROW_CENTER}width:192px;margin:16px auto 0;color:${col.accent}}
.dia i{display:block;${GROW}height:1px;background:${col.accent};opacity:.6}
.dia b{display:block;width:8px;height:8px;margin:0 8px;background:${col.accent};-webkit-transform:rotate(45deg);transform:rotate(45deg)}
.lead{margin-top:14px;font-size:22px;line-height:1.4;color:${col.muted}}
.feat{list-style:none;margin:22px 0 0;padding:0;text-align:left;${FLEX}-webkit-flex-wrap:wrap;flex-wrap:wrap;${CENTER_JUSTIFY}}
.feat li{${ROW_CENTER}max-width:200px;margin:0 12px 10px;font-size:14px;line-height:1.25}
.fi{display:block;margin-right:12px;color:${col.icon};${NOSHRINK}}
.fi svg{display:block;width:24px;height:24px}
.fi.circle,.fi.square{width:48px;height:48px;background:${rgba(col.icon, 0.12)}}
.fi.circle{border-radius:24px}
.fi.square{border-radius:6px}
.fi.circle svg,.fi.square svg{margin:12px}
.big{display:block;width:100%;max-width:448px;margin:30px auto 0;min-height:80px;padding:16px 32px;border-radius:${btnRadius};background-color:${btn};${btnImage}border:2px solid ${btnBorder};color:${btnFg};font-size:22px;font-weight:600;line-height:1.2;${btnCase}}
.big:active{opacity:.85}
.big .bi{display:inline-block;vertical-align:middle;margin:-4px 12px 0 0}
.big .bi svg{display:block;width:28px;height:28px}
.win{margin-top:18px;font-size:16px;color:${col.muted}}
.qrp{width:300px;margin-left:24px;${NOSHRINK}background:${col.card};border:1px solid ${col.border};border-radius:${Math.round(t.radius * 28)}px;${cardShadow}padding:22px;text-align:center}
.qrp .pi{display:block;color:${col.primary}}
.qrp .pi svg{display:block;width:28px;height:28px;margin:0 auto 8px}
.qrp h2{margin:0;font-size:22px;font-weight:normal;${heading}}
.qrp .qr{width:220px;height:220px;margin:12px auto}
.qrp p{font-size:15px;line-height:1.4;color:${col.muted}}
.qr{width:300px;height:300px;background:#fff;padding:8px;border-radius:${radius};${NOSHRINK}}
.qr svg{width:100%;height:100%;display:block}
#ft{position:absolute;left:32px;right:32px;bottom:44px;max-width:1100px;margin:0 auto;padding-top:10px;border-top:1px solid ${col.border};${ROW_CENTER}-webkit-box-pack:justify;-webkit-justify-content:space-between;justify-content:space-between;font-size:12px;color:${col.muted}}
#ft .tg{text-transform:uppercase;letter-spacing:.25em}
#ft b{color:${col.fg}}
.hostwel{position:fixed;top:0;left:0;right:0;bottom:0;background:${col.primary};color:${col.primaryFg};${COL}${CENTER_JUSTIFY}-webkit-box-align:center;-webkit-align-items:center;align-items:center;text-align:center;padding:40px;z-index:30}
.hostwel .lm{width:96px;height:96px;margin:0 auto 28px;padding:6px}
.hostwel h1{font-size:64px;line-height:1.1;margin:0 0 20px;${heading}}
.hostwel p{font-size:28px;line-height:1.35;margin:0 0 10px;max-width:900px}
.hostwel .big{background:${col.primaryFg};background-image:none;color:${col.primary};border-color:${col.primaryFg};width:auto;min-width:320px;display:inline-block}
.hostwel .small{font-size:18px;margin-top:28px;${ROW_CENTER}}
.hostwel .small .qr{width:120px;height:120px;padding:6px;margin-right:16px}
.lv-enhanced .hostwel .ring{position:absolute;top:24px;left:24px;right:24px;bottom:24px;border:1px solid ${rgba(col.primaryFg, 0.35)};pointer-events:none}
.cards{height:100%;max-width:1100px;margin:0 auto;background:${col.primary};color:${col.primaryFg};border-radius:${bigRadius};padding:12px;position:relative;${cardShadow}}
.cards .top{height:44px;font-size:26px;padding:4px 8px;position:relative;${heading}}
.cards .top .pg{position:absolute;right:8px;top:8px;font-size:18px;font-weight:normal}
.cgrid{position:absolute;top:56px;left:12px;right:12px;bottom:12px}
.card{position:absolute;padding:6px}
.card .in{height:100%;border-radius:${bigRadius};border:5px solid;padding:16px;overflow:hidden;position:relative}
.lv-enhanced .card .in{box-shadow:0 6px 18px rgba(0,0,0,.18)}
.card .nm{line-height:1.05;margin:0 0 6px;${heading}font-weight:700}
.card .msg{line-height:1.25;margin:0 0 6px}
.card .meta{opacity:.85}
.card .go{position:absolute;left:14px;right:14px;bottom:14px;min-height:56px;border-radius:${btnRadius};${btnCase}font-weight:bold;font-size:20px;border:4px solid;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 10px}
.card .go .bi{display:inline-block;vertical-align:middle;margin:-3px 8px 0 0}
.card .go .bi svg{display:block;width:1.1em;height:1.1em}
#corner{position:absolute;left:10px;bottom:6px;height:36px;font-size:13px;color:${col.muted};${ROW_CENTER}z-index:50}
#corner button{height:36px;padding:0 8px;color:${col.muted}}
#fs svg{width:18px;height:18px;display:block}
#dot{display:none;width:11px;height:11px;border-radius:6px;background:#D11;margin-left:6px;vertical-align:middle}
#lbl b{color:${col.fg}}
#upd{display:none;position:absolute;left:16px;bottom:56px;z-index:60;width:auto;min-width:280px;margin:0}
#ov{display:none;position:absolute;top:0;left:0;right:0;bottom:0;z-index:40;background:rgba(0,0,0,.5)}
.lv-enhanced #ov .panel{-webkit-animation:fadein .25s ease-out;animation:fadein .25s ease-out}
.panel{position:absolute;left:50%;top:50%;width:640px;max-width:92%;margin-left:-320px;-webkit-transform:translateY(-50%);transform:translateY(-50%);background:${col.card};color:${col.fg};border-radius:${bigRadius};padding:32px;max-height:90%;overflow:auto;-webkit-overflow-scrolling:touch;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.panel .x{position:absolute;right:10px;top:10px;width:52px;height:52px;color:${col.muted}}
.panel .x svg{display:block;width:28px;height:28px;margin:12px}
.panel h2{font-size:32px;margin:0 40px 10px;${heading}}
.panel p{font-size:20px;margin:0 0 12px;line-height:1.35}
.panel .big{margin:16px auto 18px}
.panel .qr{margin:10px auto;width:240px;height:240px}
.panel .hint{color:${col.muted};font-size:18px}
.spin{display:block;width:56px;height:56px;margin:20px auto;border-radius:28px;border:5px solid ${col.border};border-top-color:${col.primary};-webkit-animation:spin 1s linear infinite;animation:spin 1s linear infinite}
@-webkit-keyframes spin{to{-webkit-transform:rotate(360deg)}}
@keyframes spin{to{transform:rotate(360deg)}}
.row{display:block;width:100%;text-align:left;border:3px solid ${col.border};border-radius:${radius};padding:12px 14px 12px 64px;margin:0 0 8px;position:relative;min-height:66px;background:${col.card}}
.row.on{border-color:${col.primary}}
.row .box{position:absolute;left:16px;top:50%;margin-top:-16px;width:32px;height:32px;border-radius:8px;border:3px solid ${col.muted};color:${col.primaryFg}}
.row .box svg{display:block;width:22px;height:22px;margin:2px}
.row.on .box{background:${col.primary};border-color:${col.primary}}
.row .who{display:block;font-size:21px;font-weight:600}
.row .when{display:block;font-size:16px;color:${col.muted}}
.grp{font-size:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${col.muted};margin:14px 0 8px;text-align:left}
.panel p.grp{text-align:center}
.btns{margin-top:16px;overflow:hidden}
.btns button{float:left;width:48%;min-height:64px;border-radius:${btnRadius};font-size:22px;font-weight:bold;${btnCase}}
.btns .sec{border:2px solid ${col.border}}
.btns .pri{float:right;background-color:${btn};${btnImage}color:${btnFg};border:2px solid ${btnBorder}}
#saver{display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:#000;z-index:70;overflow:hidden}
#saver .one{position:absolute;color:#555;font-size:120px;font-weight:200}
#clocks{position:absolute;left:0;right:0;top:50%;margin-top:-140px;height:280px;${ROW_CENTER}${CENTER_JUSTIFY}color:#fff;-webkit-transition:-webkit-transform 19s ease-in-out;transition:transform 19s ease-in-out}
#clocks figure{margin:0 22px;text-align:center}
#clocks svg{display:block;margin:0 auto 14px}
#clocks .ct{display:block;font-size:13px;letter-spacing:.3em;text-transform:uppercase}
#clocks .tm{display:block;font-size:22px;margin-top:4px;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:200}
#saverdim{position:absolute;top:0;left:0;right:0;bottom:0;background:#000;opacity:0}
#saverqr{display:none;position:absolute;width:180px;height:180px;background:#fff;padding:8px;border-radius:12px}
#saverqr svg{width:100%;height:100%;display:block}
#camon{display:none;position:absolute;left:12px;top:12px;z-index:80;background:#000;color:#fff;border-radius:20px;padding:8px 14px;font-size:15px}
#net{display:none;position:absolute;right:12px;bottom:8px;font-size:14px;color:#B33;z-index:55}
.lv-lite #bd .art,.lv-lite .sn,.lv-lite #clocks{display:none}
.lv-lite .big,.lv-lite .btns .pri{background-image:none}
${xlStyles}
@media (max-width:900px){.wc h1{font-size:36px}.lead{font-size:19px}.hostwel h1{font-size:46px}.qrp{width:250px}.qrp .qr{width:180px;height:180px}#main{padding:0 20px}#hd{padding-left:20px;padding-right:20px}}
@media (orientation:portrait){
.home{-webkit-box-orient:vertical;-webkit-flex-direction:column;flex-direction:column;${CENTER_JUSTIFY}}
.wcard{-webkit-box-flex:0;-webkit-flex:none;flex:none;width:100%}
.qrp{width:100%;margin:20px 0 0;${ROW_CENTER}text-align:left;padding:16px 20px}
.qrp .pi{display:none}
.qrp h2{-webkit-box-ordinal-group:2;-webkit-order:2;order:2}
.qrp .qr{width:140px;height:140px;margin:0 20px 0 0}
.qrp p{display:none}
#nm b{font-size:21px}
}
</style>
</head>
<body class="${centred ? "centred atwel" : "atwel"}">
${backdrop}
${sideNotes}
<div id="hd"><div id="hdi"><span class="lm">${logo}</span><span id="nm"><b>${esc(p.name)}</b>${t.subname ? `<small>${esc(t.subname)}</small>` : ""}</span><span id="clk"><b></b><small></small></span><span id="act"><button id="bell" class="icon" style="display:none" aria-label="${esc(copy.bellTitle)}">${icons.bell}</button><button id="day" class="icon" aria-label="${esc(guestCopy.saverStart)}"></button></span></div></div>
<div id="main">${homeHtml}</div>
${footer}
<div id="corner"><button id="fs" style="display:none" aria-label="Full screen">${icons.full}</button><button id="ver"><span id="lbl"></span>v${esc(APP_VERSION)}<span id="dot"></span></button></div>
<button id="upd" class="big"></button>
<div id="ov"></div>
<div id="saver"><div id="clocks"></div><div id="saverdim"></div><span class="one"></span><div id="saverqr"></div></div>
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
    mode?: "lite" | "enhanced" | "full" | undefined;
    fullFailed?: boolean | undefined;
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
      compat: {
        detected: body.detected !== false,
        reason: browserLabel(userAgent),
        ...(body.mode ? { mode: body.mode } : {}),
        ...(body.fullFailed ? { fullFailed: true } : {}),
      },
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
  const clock = await liteClock(rest.tz);
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
      mode: tablet.mode,
      modeChosen: tablet.modeChosen,
      fullFailedAt: tablet.fullFailedAt,
      cardPicker: tablet.cardPicker,
      update: tablet.update,
      // The host is looking through its camera until then (only where the browser can share it).
      watchUntil: tablet.watchUntil,
    },
    rest,
    clock,
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
    tz,
  };
}

/**
 * The header's date and day icon, and the screensaver's world clocks as
 * the full kiosk picks them (home in the middle, cities behind and ahead),
 * with each city's offset so the tablet turns the hands itself.
 */
export async function liteClock(tz: string, now = new Date()) {
  const { dayProgress, kioskNow, worldClocksFor } = await import("./kiosk-clock");
  const { zoneCity } = await import("./world");
  return {
    phase: dayProgress(now, tz).phase,
    date: kioskNow(now, tz).date,
    clocks: worldClocksFor(tz, zoneCity(tz), now).map((c) => ({
      city: c.city,
      home: c.home,
      offset: zoneOffsetMinutes(c.tz, now),
    })),
  };
}
