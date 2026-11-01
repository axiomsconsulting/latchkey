/*
 * The compatible kiosk for older door tablets (an iPad 2 on Safari 9, old
 * Android browsers): plain ES5, no modules, no build step. The page
 * (/lite/<code>, src/lib/kiosk-lite.server.ts) sets window.__LITE; this asks
 * /api/public/kiosk-lite/<code> for the tablet's state every 30 seconds and
 * shows the guest cards, the host's welcome, Express check-out and the bell,
 * with check-in on the guest's own phone by QR code. Tested to parse as ES5
 * in tests/kiosk-lite.test.ts: keep it to var, function and XMLHttpRequest.
 *
 * Two levels (kiosk-compat.ts): "enhanced" (html.lv-enhanced) looks like the
 * full kiosk, with the theme's pictures, fonts, icons and world clocks;
 * "lite" (html.lv-lite) is the plain, fast version. The host picks the level
 * (or "full") per tablet; this follows it.
 */
(function () {
  "use strict";
  var L = window.__LITE;
  if (!L) return;
  var W = L.words;
  var API = "/api/public/kiosk-lite/" + L.code;
  var DEVICE_KEY = "latchkey.kioskDevice." + L.code;
  var COMPAT_KEY = "latchkey.compat." + L.code;
  var MODE_KEY = "latchkey.kioskMode." + L.code;
  var I = L.icons || {};
  var LEVEL = window.__LV === "lite" ? "lite" : "enhanced";
  // Sent here because the full kiosk didn't start on this browser: told once, and it stays here.
  var fullFailed = /[?&]nofull=1/.test(window.location.search);
  var skew = L.serverNow - new Date().getTime();
  var state = null;
  var lastTouch = new Date().getTime();
  var overlay = null; // "qr" | "express" | "bell" | "update" | null
  var cardsAside = false;
  var saverOn = false;
  var UPDATE_IDLE_MS = 15 * 60 * 1000;
  var PER_PAGE = 10;
  var PAGE_MS = 5000;

  function $(id) {
    return document.getElementById(id);
  }
  function get(k) {
    try {
      return window.localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function put(k, v) {
    try {
      if (v === null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch (e) {
      /* not kept: it joins again next time */
    }
  }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fill(t, k, v) {
    return String(t)
      .split("{" + k + "}")
      .join(v);
  }
  function now() {
    return new Date().getTime() + skew;
  }
  function two(n) {
    return n < 10 ? "0" + n : String(n);
  }
  function clockText() {
    var d = new Date(now() + L.offset * 60000);
    return two(d.getUTCHours()) + ":" + two(d.getUTCMinutes());
  }

  /** The richest level this browser can run: the same test as kiosk-compat.ts detectMode. */
  function detectedMode() {
    var mod = "noModule" in document.createElement("script");
    var mix = !!(
      window.CSS &&
      window.CSS.supports &&
      window.CSS.supports("color", "color-mix(in srgb, red, blue)")
    );
    if (mod && mix) return "full";
    var st = document.createElement("div").style;
    var flex = "flexBasis" in st || "webkitFlexBasis" in st || "WebkitFlexBasis" in st;
    var svg = !!(
      document.createElementNS &&
      document.createElementNS("http://www.w3.org/2000/svg", "svg").createSVGRect
    );
    return flex && svg ? "enhanced" : "lite";
  }
  function detected() {
    return detectedMode() !== "full";
  }

  function call(body, done) {
    var x = new XMLHttpRequest();
    x.open("POST", API, true);
    x.setRequestHeader("Content-Type", "application/json");
    x.timeout = 20000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var res = null;
      try {
        res = JSON.parse(x.responseText);
      } catch (e) {
        res = null;
      }
      if (x.status >= 200 && x.status < 300 && res) done(null, res);
      else done((res && res.error) || "failed", null);
    };
    x.send(JSON.stringify(body));
  }

  // ---- State from Latchkey ----------------------------------------------------

  function refresh() {
    var device = get(DEVICE_KEY);
    var body = {
      action: "state",
      detected: detected(),
      mode: detectedMode(),
      screen: currentScreen()
    };
    if (fullFailed) body.fullFailed = true;
    if (device) body.device = device;
    call(body, function (err, res) {
      $("net").style.display = err ? "block" : "none";
      $("net").innerHTML = err ? esc(W.offline) : "";
      if (err) return;
      skew = res.serverNow - new Date().getTime();
      if (res.tablet.device) put(DEVICE_KEY, res.tablet.device);
      fullFailed = false;
      if (followLevel(res.tablet)) return;
      var before = state;
      state = res;
      // A card the host just put up shows, even if someone had put the cards aside.
      if (!before || hasNewCard(before, res)) {
        cardsAside = false;
        if (saverOn) saver(false);
      }
      render();
      header();
      corner();
      maybeUpdate();
      watchCamera(res.tablet.watchUntil);
    });
  }

  /**
   * The level the host chose (or what this browser can do): full goes to the
   * full kiosk, unless it just failed to start here; the other level reloads
   * this page at that level. True when the page is leaving.
   */
  function followLevel(t) {
    var mode = t.mode || (t.compat === false ? "full" : "enhanced");
    put(COMPAT_KEY, null);
    put(MODE_KEY, t.modeChosen || null);
    if (mode === "full") {
      if (t.fullFailedAt) return false;
      window.location.replace("/kiosk/" + L.code);
      return true;
    }
    if (mode !== LEVEL) {
      window.location.replace("/lite/" + L.code);
      return true;
    }
    return false;
  }

  /** What's on screen, for the host's live view (kiosk-screen.ts): which screen only. */
  function currentScreen() {
    var view = "start";
    if (saverOn) view = saverView();
    else if (overlay === "checkin" || overlay === "qr") view = "checkin";
    else if (cards().length && !cardsAside) view = "cards";
    else if (state && state.welcome && !cardsAside) view = "welcome";
    return { view: view, lite: true, fullscreen: isFull(), camera: canCamera() };
  }

  // ---- The host's camera view: only where the browser can share the camera ----------

  function getMedia() {
    var md = navigator.mediaDevices;
    if (md && md.getUserMedia)
      return function (c, ok, no) {
        md.getUserMedia(c).then(ok, no);
      };
    var old = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    return old
      ? function (c, ok, no) {
          old.call(navigator, c, ok, no);
        }
      : null;
  }
  function canCamera() {
    return !!getMedia();
  }
  var cam = null; // { stream, video, timer }
  function watchCamera(until) {
    var watching = until && Date.parse(until) > now();
    // Never while a guest is taking their ID photo (the camera is theirs then).
    if (!watching || !canCamera() || overlay === "checkin" || overlay === "qr") return stopCamera();
    $("camon").style.display = "block";
    if (cam) return;
    cam = { stream: null, video: document.createElement("video"), timer: 0 };
    cam.video.setAttribute("playsinline", "");
    cam.video.muted = true;
    getMedia()(
      { video: { facingMode: "user" }, audio: false },
      function (stream) {
        if (!cam)
          return (
            stream.getTracks &&
            stream.getTracks().forEach(function (t) {
              t.stop();
            })
          );
        cam.stream = stream;
        if ("srcObject" in cam.video) cam.video.srcObject = stream;
        else cam.video.src = window.URL.createObjectURL(stream);
        cam.video.play();
        cam.timer = window.setInterval(snap, 3000);
      },
      function () {
        stopCamera();
      }
    );
  }
  function snap() {
    var device = get(DEVICE_KEY);
    if (!cam || !cam.video.videoWidth || !device) return;
    var image = shrink(cam.video.videoWidth ? videoFrame(cam.video) : null, 480, 0.6);
    call({ action: "snapshot", device: device, image: image }, function (err, r) {
      if (err || !r || !r.watchUntil) stopCamera();
    });
  }
  function videoFrame(v) {
    return { width: v.videoWidth, height: v.videoHeight, el: v };
  }
  function stopCamera() {
    $("camon").style.display = "none";
    if (!cam) return;
    window.clearInterval(cam.timer);
    if (cam.stream && cam.stream.getTracks)
      cam.stream.getTracks().forEach(function (t) {
        t.stop();
      });
    cam = null;
  }

  function cardKeys(s) {
    var c = s.cards && s.cards.cards ? s.cards.cards : [];
    var k = [];
    for (var i = 0; i < c.length; i++) k.push(c[i].kind + ":" + (c[i].handle || c[i].firstName));
    return k;
  }
  function hasNewCard(a, b) {
    var seen = {};
    var was = cardKeys(a);
    var now = cardKeys(b);
    for (var i = 0; i < was.length; i++) seen[was[i]] = true;
    for (var j = 0; j < now.length; j++) if (!seen[now[j]]) return true;
    return false;
  }

  /** Every few seconds: did the host show or take off a card? Then read everything now. */
  var stampAt;
  function checkStamp() {
    if (document.hidden) return;
    call({ action: "stamp" }, function (err, r) {
      if (err || !r) return;
      if (stampAt !== undefined && r.at !== stampAt) refresh();
      stampAt = r.at;
    });
  }

  function cardsKey(s) {
    var c = s.cards && s.cards.cards ? s.cards.cards : [];
    var k = [];
    for (var i = 0; i < c.length; i++) k.push(c[i].kind + c[i].firstName + c[i].handle);
    return k.join("|") + "/" + (s.welcome ? s.welcome.version : "");
  }

  // ---- The screen ---------------------------------------------------------------

  function cards() {
    return state && state.cards && state.cards.cards ? state.cards.cards : [];
  }

  var drawn = "";
  function render() {
    var main = $("main");
    var list = cards();
    var home = !(list.length && !cardsAside) && !(state && state.welcome && !cardsAside);
    $("bell").style.display = state && state.tablet.cardPicker ? "block" : "none";
    $("day").style.display = home ? "block" : "none";
    document.body.className = (L.centred ? "centred " : "") + (home ? "atwel" : "");
    if (!home && list.length && !cardsAside) return renderCards(main, list);
    if (!home) return renderWelcome(main, state.welcome);
    // The start screen is drawn once (redrawing would replay its fade).
    if (drawn !== "home") renderHome(main);
  }

  /** The header: time and date, and the day's icon (sunrise, sun, sunset, moon) as on the kiosk. */
  var phase = "";
  function header() {
    $("clk").getElementsByTagName("b")[0].innerHTML = esc(clockText());
    var c = state && state.clock;
    if (!c) return;
    $("clk").getElementsByTagName("small")[0].innerHTML = esc(c.date);
    if (c.phase !== phase && I[c.phase]) {
      phase = c.phase;
      $("day").innerHTML = I[c.phase];
    }
  }

  function qrBlock() {
    return '<div class="qr">' + (window.__LITE_QR || "") + "</div>";
  }

  /** The start screen, built by the page in the property's look (kiosk-lite.server.ts). */
  function renderHome(main) {
    main.innerHTML = L.homeHtml;
    drawn = "home";
  }

  /** The host's own welcome: full screen in the property's colour, with Check in. */
  function renderWelcome(main, w) {
    if (drawn === "welcome:" + w.version) return;
    drawn = "welcome:" + w.version;
    main.innerHTML =
      '<div class="hostwel"><div class="ring"></div>' +
      (L.logo ? '<span class="lm">' + L.logo + "</span>" : "") +
      "<h1>" +
      esc(w.headline) +
      "</h1>" +
      (w.body ? "<p>" + esc(w.body) + "</p>" : "") +
      '<button class="big" data-act="checkin">' +
      esc(W.checkIn) +
      '</button><div class="small">' +
      qrBlock() +
      "<span>" +
      esc(W.orPhoneShort) +
      "</span></div></div>";
  }

  function gridFor(n) {
    var cols = Math.ceil(Math.sqrt(n));
    return { cols: cols, rows: Math.ceil(n / cols) };
  }

  function renderCards(main, list) {
    var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    var page = Math.floor(now() / PAGE_MS) % pages;
    // Unchanged cards on the same page stay as they are.
    var sig = "cards:" + cardsKey(state) + ":" + page + ":" + window.innerWidth;
    if (drawn === sig) return;
    drawn = sig;
    var items = list.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
    var g = gridFor(items.length);
    var nIn = 0;
    var nOut = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].kind === "in") nIn++;
      else nOut++;
    }
    var title = [];
    if (nIn) title.push(fill(W.inCount, "n", nIn));
    if (nOut) title.push(fill(W.outCount, "n", nOut));
    var html =
      '<div class="cards"><div class="top">' +
      esc(title.join(" \u00b7 ")) +
      (pages > 1
        ? '<span class="pg">' + esc(fill(fill(W.page, "n", page + 1), "of", pages)) + "</span>"
        : "") +
      '</div><div class="cgrid" id="grid">';
    for (var j = 0; j < items.length; j++) {
      var c = items[j];
      var look = (L.xlCards || state.cards.look)[c.kind === "in" ? "in" : "out"];
      var col = j % g.cols;
      var row = Math.floor(j / g.cols);
      html +=
        '<div class="card" style="left:' +
        (col * 100) / g.cols +
        "%;top:" +
        (row * 100) / g.rows +
        "%;width:" +
        100 / g.cols +
        "%;height:" +
        100 / g.rows +
        '%"><div class="in" style="background:' +
        look.bg +
        ";color:" +
        look.ink +
        ";border-color:" +
        look.edge +
        '"><p class="nm">' +
        esc(c.firstName) +
        (c.room ? ' <span class="meta">\u00b7 ' + esc(c.room) + "</span>" : "") +
        '</p><p class="msg">' +
        esc(c.message) +
        '</p><p class="meta">' +
        esc(fill(c.kind === "in" ? W.arriving : W.leaving, "t", c.until)) +
        '</p><button class="go" data-i="' +
        (page * PER_PAGE + j) +
        '" style="border-color:' +
        look.ink +
        ";color:" +
        look.ink +
        '"><span class="bi">' +
        (c.kind === "in" ? I.check || "" : I.leave || "") +
        "</span>" +
        esc(c.kind === "in" ? W.checkIn : W.express) +
        "</button></div></div>";
    }
    html += "</div></div>";
    main.innerHTML = html;
    fitCards();
  }

  /** Text as big as each card allows: shrink until the words and the button fit. */
  function fitCards() {
    var grid = $("grid");
    if (!grid) return;
    var cs = grid.getElementsByClassName("in");
    for (var i = 0; i < cs.length; i++) {
      var box = cs[i];
      // The button sits at the bottom: its own size, and room kept for it.
      var go = box.getElementsByClassName("go")[0];
      var btn = Math.max(14, Math.min(22, box.clientWidth / 13));
      if (go) {
        go.style.fontSize = btn + "px";
        go.style.minHeight = btn * 2.6 + "px";
        box.style.paddingBottom = btn * 2.6 + 28 + "px";
      }
      var size = Math.min(box.clientWidth / 7, box.clientHeight / 5, 64);
      for (var k = 0; k < 24; k++) {
        box.style.fontSize = size + "px";
        var nm = box.getElementsByClassName("nm")[0];
        if (nm) nm.style.fontSize = size * 1.3 + "px";
        if (box.scrollHeight <= box.clientHeight + 1 || size <= 12) break;
        size = size * 0.9;
      }
    }
  }

  // ---- Overlays: phone check-in, Express check-out, the bell ----------------------

  function show(kind, html) {
    overlay = kind;
    var ov = $("ov");
    ov.innerHTML =
      '<div class="panel"><button class="x" data-act="close" aria-label="' +
      esc(W.close) +
      '">' +
      (I.close || "") +
      "</button>" +
      html +
      "</div>";
    ov.style.display = "block";
  }
  function hide() {
    overlay = null;
    $("ov").style.display = "none";
    $("ov").innerHTML = "";
  }

  /** A stable id for this tablet's tries (wrong IDs lock it for a while, as on the full kiosk). */
  function triesId() {
    var id = get("latchkey.liteTries." + L.code);
    if (!id) {
      id = "lite-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      put("latchkey.liteTries." + L.code, id);
    }
    return id;
  }

  /** Can this browser take a photo through a file field (iPad 2: yes, it opens the camera)? */
  var canPhoto = (function () {
    var i = document.createElement("input");
    i.setAttribute("type", "file");
    return i.type === "file" && !i.disabled && !!window.FileReader;
  })();

  /**
   * Check in: the guest's own phone first (its camera is far better than an
   * old tablet's), then this tablet's camera (a photo of the photo ID finds
   * the booking) where it has one.
   */
  function phonePanel() {
    show(
      "qr",
      "<h2>" +
        esc(W.checkInHere) +
        "</h2><p>" +
        esc(W.phoneFirst) +
        "</p>" +
        qrBlock() +
        "<p>" +
        esc(W.orVisit) +
        "<br><b>" +
        esc(L.shortUrl) +
        "</b></p>" +
        (canPhoto
          ? '<p class="grp">' +
            esc(W.orTablet) +
            '</p><label class="row" style="text-align:center;padding-left:14px"><span class="bi">' +
            (I.camera || "") +
            "</span> " +
            esc(W.takeId) +
            '<input id="idphoto" type="file" accept="image/*" capture="environment" style="position:absolute;left:-9999px;opacity:0"></label>'
          : "") +
        '<div class="btns"><button class="sec" data-act="close" style="width:100%">' +
        esc(W.close) +
        "</button></div>"
    );
    var input = $("idphoto");
    if (input)
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (f) readId(f);
      };
  }

  /** The photo, made smaller in the browser: one to read, one small copy to keep (if the host keeps them). */
  function shrink(img, max, quality) {
    var k = Math.min(1, max / Math.max(img.width, img.height));
    var c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img.el || img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  }

  function readId(file) {
    show("checkin", "<h2>" + esc(W.reading) + '</h2><span class="spin"></span>');
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var big = shrink(img, 1600, 0.85);
        var small = shrink(img, 480, 0.7);
        call({ action: "findById", deviceId: triesId(), image: big, small: small }, idResult);
      };
      img.onerror = function () {
        idResult("failed", null);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function idResult(err, r) {
    var close =
      '<div class="btns"><button class="pri" data-act="close" style="width:100%">' +
      esc(W.done) +
      "</button></div>";
    if (err || !r) {
      show("checkin", "<h2>" + esc(W.error) + "</h2>" + close);
      return;
    }
    if (r.status === "retry") {
      show(
        "checkin",
        "<h2>" +
          esc(W.retry) +
          "</h2><p>" +
          esc(W.idHint) +
          '</p><div class="btns"><button class="sec" data-act="close">' +
          esc(W.close) +
          '</button><button class="pri" data-act="again">' +
          esc(W.tryAgain) +
          "</button></div>"
      );
      return;
    }
    if (r.status === "locked") {
      show("checkin", "<h2>" + esc(W.locked) + "</h2>" + close);
      return;
    }
    // Found: they finish on their phone from here. Not found: their phone, the usual way.
    show(
      "checkin",
      "<h2>" +
        esc(r.status === "matched" ? fill(W.matched, "name", r.firstName || "") : W.notFound) +
        "</h2><p>" +
        esc(r.status === "matched" ? W.finishPhone : W.scan) +
        '</p><div class="qr">' +
        (r.qr || "") +
        "</div>" +
        close
    );
    // The link to their check-in only stays on screen for a few minutes.
    window.setTimeout(
      function () {
        if (overlay === "checkin") hide();
      },
      3 * 60 * 1000
    );
  }

  function express(card) {
    call({ action: "express", handle: card.handle }, function (err, r) {
      if (err) {
        show(
          "express",
          "<p>" +
            esc(err) +
            '</p><div class="btns"><button class="pri" data-act="close" style="width:100%">' +
            esc(W.close) +
            "</button></div>"
        );
        return;
      }
      show(
        "express",
        "<h2>" +
          esc(r.firstName ? fill(W.thanks, "name", r.firstName) : W.thanksNoName) +
          "</h2>" +
          (r.keyDrop ? "<p>" + esc(r.keyDrop) + "</p>" : "") +
          (r.lockDoor ? "<p>" + esc(W.lockDoor) + "</p>" : "") +
          (r.reviewUrl
            ? "<p>" + esc(W.review) + '</p><div class="qr">' + (r.reviewQr || "") + "</div>"
            : "") +
          '<div class="btns"><button class="pri" data-act="close" style="width:100%">' +
          esc(W.done) +
          "</button></div>"
      );
      // Back to the usual screen after 10 minutes, as on the full kiosk.
      window.setTimeout(
        function () {
          if (overlay === "express") hide();
        },
        10 * 60 * 1000
      );
      refresh();
    });
  }

  var bellItems = [];
  var bellChosen = {};

  function openBell() {
    var device = get(DEVICE_KEY);
    if (!device) return;
    show("bell", "<h2>" + esc(W.bellTitle) + '</h2><span class="spin"></span>');
    call({ action: "picker", device: device }, function (err, r) {
      if (overlay !== "bell") return;
      if (err || !r.on) {
        show("bell", "<p>" + esc(W.error) + "</p>" + bellButtons());
        return;
      }
      bellItems = r.items;
      bellChosen = {};
      for (var i = 0; i < bellItems.length; i++) if (bellItems[i].showing) bellChosen[i] = true;
      drawBell();
    });
  }

  function bellButtons() {
    return (
      '<div class="btns"><button class="sec" data-act="close">' +
      esc(W.close) +
      '</button><button class="pri" data-act="apply">' +
      esc(W.bellApply) +
      "</button></div>"
    );
  }

  function drawBell() {
    var html = "<h2>" + esc(W.bellTitle) + "</h2><p>" + esc(W.bellHelp) + "</p>";
    if (!bellItems.length) html += "<p>" + esc(W.bellEmpty) + "</p>";
    var kinds = ["in", "out"];
    for (var k = 0; k < 2; k++) {
      var first = true;
      for (var i = 0; i < bellItems.length; i++) {
        var it = bellItems[i];
        if (it.kind !== kinds[k]) continue;
        if (first) {
          html += '<p class="grp">' + esc(k === 0 ? W.bellArriving : W.bellLeaving) + "</p>";
          first = false;
        }
        var on = !!bellChosen[i];
        html +=
          '<button class="row' +
          (on ? " on" : "") +
          '" data-pick="' +
          i +
          '"><span class="box">' +
          (on ? I.check || "\u2713" : "") +
          '</span><span class="who">' +
          esc(it.name) +
          (it.room ? " \u00b7 " + esc(it.room) : "") +
          '</span><span class="when">' +
          esc(
            it.showing
              ? W.bellOnScreen
              : it.autoAt
                ? fill(W.bellAutoAt, "t", it.autoAt)
                : W.bellNotSet
          ) +
          "</span></button>";
      }
    }
    show("bell", html + bellButtons());
  }

  function applyBell() {
    var device = get(DEVICE_KEY);
    var changes = [];
    for (var i = 0; i < bellItems.length; i++) {
      var want = !!bellChosen[i];
      if (want !== bellItems[i].showing)
        changes.push({ handle: bellItems[i].handle, kind: bellItems[i].kind, show: want });
    }
    if (!changes.length || !device) return hide();
    call({ action: "setCards", device: device, changes: changes }, function (err) {
      if (err) {
        show("bell", "<p>" + esc(W.error) + "</p>" + bellButtons());
        return;
      }
      hide();
      cardsAside = false;
      refresh();
    });
  }

  // ---- Corner: the tablet, the version, Update and full screen (3 taps each) ----------

  function corner() {
    var t = state ? state.tablet : null;
    var lbl = "";
    if (t && t.status === "pending" && t.pairCode)
      lbl =
        "<b>" +
        esc(fill(W.setup, "code", t.pairCode.slice(0, 3) + " " + t.pairCode.slice(3))) +
        "</b> \u00b7 ";
    else if (t && t.number) lbl = esc(t.label || "Tablet " + t.number) + " \u00b7 ";
    $("lbl").innerHTML = lbl;
    $("dot").style.display = newer() ? "inline-block" : "none";
  }

  function newer() {
    return !!state && state.version !== L.version;
  }

  function reloadNow() {
    window.location.reload();
  }

  /** The host asked for an update: now, or once nobody has touched it for 15 minutes. */
  function maybeUpdate() {
    if (!newer() || !state.tablet.update) return;
    var u = state.tablet.update;
    if (Date.parse(u.at) > now()) return;
    if (u.mode === "now") return reloadNow();
    if (new Date().getTime() - lastTouch >= UPDATE_IDLE_MS && !cards().length && !overlay)
      reloadNow();
  }

  function taps(done) {
    var seen = [];
    return function () {
      var t = new Date().getTime();
      var keep = [];
      for (var i = 0; i < seen.length; i++) if (t - seen[i] < 1500) keep.push(seen[i]);
      keep.push(t);
      if (keep.length >= 3) {
        seen = [];
        done();
      } else seen = keep;
    };
  }

  var root = document.documentElement;
  var canFull = !!(root.requestFullscreen || root.webkitRequestFullscreen);
  function isFull() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function enterFull() {
    if (get("latchkey.kioskFullscreen") === "off" || isFull()) return;
    try {
      if (root.requestFullscreen) root.requestFullscreen();
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    } catch (e) {
      /* not allowed here */
    }
  }

  var tapVersion = taps(function () {
    if (!newer()) return;
    var b = $("upd");
    b.innerHTML = esc(fill(W.update, "v", state.version));
    b.style.display = "block";
    window.setTimeout(function () {
      b.style.display = "none";
    }, 20000);
  });
  var tapFull = taps(function () {
    if (isFull()) {
      put("latchkey.kioskFullscreen", "off");
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      put("latchkey.kioskFullscreen", null);
      enterFull();
    }
  });

  // ---- Screensaver: only when no cards or welcome are up -------------------------------

  function rest() {
    return (state && state.rest) || null;
  }
  function saverMs() {
    var r = rest();
    return (r && r.saverMinutes ? r.saverMinutes : 10) * 60 * 1000;
  }
  function resetMs() {
    var r = rest();
    return (r && r.resetMinutes ? r.resetMinutes : 2) * 60 * 1000;
  }

  /** At rest, as the host set it: the night light in their colours, the clock, or the screen off. */
  var nightStep = 0;
  function saver(on) {
    var was = saverOn;
    saverOn = on;
    if (was !== on) window.setTimeout(refresh, 0);
    $("saver").style.display = on ? "block" : "none";
    if (on) drawSaver();
  }
  function saverView() {
    var r = rest();
    return r ? (r.show === "night" ? "night" : r.show === "blank" ? "blank" : "saver") : "saver";
  }
  function drawSaver() {
    var r = rest();
    var box = $("saver");
    var clock = box.getElementsByTagName("span")[0];
    var clocks = $("clocks");
    var qr = $("saverqr");
    var w = window.innerWidth;
    var h = window.innerHeight;
    var view = saverView();
    if (view === "night" && r) {
      // The colours drift from one to the next (a CSS transition, light on old tablets).
      var cs = r.nightColours || ["#ffd29a"];
      nightStep = (nightStep + 1) % cs.length;
      box.style.webkitTransition = "background-color " + r.nightSeconds + "s linear";
      box.style.transition = "background-color " + r.nightSeconds + "s linear";
      box.style.backgroundColor = cs[nightStep];
      $("saverdim").style.opacity = String(1 - (r.nightBrightness || 1));
      clock.style.display = "none";
      clocks.style.display = "none";
    } else if (view !== "blank" && LEVEL === "enhanced" && state && state.clock) {
      // The world clocks, as the full kiosk's screensaver: home larger in the middle.
      box.style.backgroundColor = "#000";
      $("saverdim").style.opacity = "0";
      clock.style.display = "none";
      clocks.style.display = "";
      drawClocks(clocks, r, w, h);
    } else {
      box.style.backgroundColor = "#000";
      $("saverdim").style.opacity = "0";
      clocks.style.display = "none";
      clock.style.display = view === "blank" ? "none" : "block";
      var level = Math.round(60 + 140 * (r ? r.clockBrightness || 0.5 : 0.5));
      clock.style.color = "rgb(" + level + "," + level + "," + level + ")";
      clock.innerHTML = esc(clockText());
      clock.style.left = Math.round(Math.random() * Math.max(0, w - 360)) + "px";
      clock.style.top = Math.round(Math.random() * Math.max(0, h - 160)) + "px";
    }
    // The phone QR, when the host shows it at rest: in a corner that changes now and then.
    if (r && r.qr) {
      qr.innerHTML = window.__LITE_QR || "";
      qr.style.display = "block";
      var spot = Math.floor(now() / (3 * 60 * 1000)) % 4;
      qr.style.left = spot % 2 ? "auto" : "24px";
      qr.style.right = spot % 2 ? "24px" : "auto";
      qr.style.top = spot < 2 ? "24px" : "auto";
      qr.style.bottom = spot < 2 ? "auto" : "24px";
      qr.style.opacity = view === "night" ? "0.9" : "0.35";
    } else qr.style.display = "none";
  }

  /** One analogue clock, drawn as the kiosk's Dial: ring, hour marks, two hands, city and time. */
  function dial(c, size) {
    var d = new Date(now() + c.offset * 60000);
    var hh = d.getUTCHours();
    var mm = d.getUTCMinutes();
    var marks = "";
    for (var i = 0; i < 12; i++)
      marks +=
        '<line x1="50" y1="' +
        (i % 3 === 0 ? 7 : 9) +
        '" x2="50" y2="12" stroke="currentColor" stroke-opacity="' +
        (i % 3 === 0 ? 0.4 : 0.22) +
        '" stroke-width="' +
        (i % 3 === 0 ? 1.2 : 0.7) +
        '" transform="rotate(' +
        i * 30 +
        ' 50 50)"/>';
    return (
      '<figure style="opacity:' +
      (c.home ? 1 : 0.8) +
      '"><svg viewBox="0 0 100 100" width="' +
      size +
      '" height="' +
      size +
      '"><circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-opacity="0.22" stroke-width="0.8"/>' +
      marks +
      '<line x1="50" y1="50" x2="50" y2="27" stroke="currentColor" stroke-opacity="0.55" stroke-width="2.2" stroke-linecap="round" transform="rotate(' +
      ((hh % 12) + mm / 60) * 30 +
      ' 50 50)"/><line x1="50" y1="50" x2="50" y2="15" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.2" stroke-linecap="round" transform="rotate(' +
      mm * 6 +
      ' 50 50)"/><circle cx="50" cy="50" r="1.6" fill="currentColor" fill-opacity="0.5"/></svg><span class="ct">' +
      esc(c.city) +
      '</span><span class="tm">' +
      two(hh) +
      ":" +
      two(mm) +
      "</span></figure>"
    );
  }

  /** Home in the middle with cities behind and ahead (three when upright), drifting slowly against burn-in. */
  var driftAt = 0;
  function drawClocks(box, r, w, h) {
    var all = state.clock.clocks || [];
    var home = 0;
    for (var i = 0; i < all.length; i++) if (all[i].home) home = i;
    var keep = w < h ? 1 : 2;
    var list = all.slice(Math.max(0, home - keep), home + keep + 1);
    var big = Math.round(Math.min(w, h) * 0.27);
    var small = Math.round(big * 0.62);
    var html = "";
    for (var j = 0; j < list.length; j++) html += dial(list[j], list[j].home ? big : small);
    box.innerHTML = html;
    box.style.height = big + 70 + "px";
    box.style.marginTop = -Math.round((big + 70) / 2) + "px";
    var glow = 0.4 + 0.6 * (r ? r.clockBrightness || 0.5 : 0.5);
    box.style.color = "rgba(255,255,255," + glow.toFixed(2) + ")";
    if (now() - driftAt > 60000) {
      driftAt = now();
      var x = Math.round((Math.random() - 0.5) * w * 0.12);
      var y = Math.round((Math.random() - 0.5) * h * 0.2);
      box.style.webkitTransform = "translate(" + x + "px," + y + "px)";
      box.style.transform = "translate(" + x + "px," + y + "px)";
    }
  }

  function tick() {
    header();
    var idle = new Date().getTime() - lastTouch;
    var busy = cards().length || (state && state.welcome) || overlay;
    if (!saverOn && !busy && idle >= saverMs()) saver(true);
    if (saverOn && busy && !overlay) saver(false);
    // Left open and walked away from: the panels close by themselves.
    if (overlay && overlay !== "express" && idle >= resetMs()) hide();
    // Someone said "check in" from a card, then left: the cards come back.
    if (cardsAside && idle >= resetMs()) {
      cardsAside = false;
      render();
    }
    maybeUpdate();
  }

  // ---- Touches -----------------------------------------------------------------------

  function touched() {
    lastTouch = new Date().getTime();
    if (saverOn) saver(false);
    if (canFull) enterFull();
  }

  function attr(el, name) {
    while (el && el.getAttribute) {
      var v = el.getAttribute(name);
      if (v !== null) return { el: el, v: v };
      el = el.parentNode;
    }
    return null;
  }

  document.addEventListener("touchstart", touched, true);
  document.addEventListener("mousedown", touched, true);
  document.addEventListener("keydown", touched, true);

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      var go = attr(t, "data-i");
      if (go) {
        var c = cards()[Number(go.v)];
        if (!c) return;
        if (c.kind === "in") phonePanel();
        else express(c);
        return;
      }
      var act = attr(t, "data-act");
      if (act) {
        if (act.v === "close") hide();
        if (act.v === "again" || act.v === "checkin") phonePanel();
        if (act.v === "apply") applyBell();
        return;
      }
      var pick = attr(t, "data-pick");
      if (pick) {
        var i = Number(pick.v);
        bellChosen[i] = !bellChosen[i];
        drawBell();
        return;
      }
      if (attr(t, "id") && attr(t, "id").v === "ov" && t.id === "ov") hide();
    },
    false
  );

  $("bell").onclick = openBell;
  $("day").onclick = function () {
    window.setTimeout(function () {
      saver(true);
    }, 50);
  };
  $("ver").onclick = tapVersion;
  $("upd").onclick = reloadNow;
  if (canFull) {
    $("fs").style.display = "block";
    $("fs").onclick = tapFull;
  }
  window.addEventListener("resize", function () {
    if (cards().length && !cardsAside) render();
  });

  refresh();
  window.setInterval(refresh, 20000);
  window.setInterval(checkStamp, 5000);
  window.setInterval(tick, 5000);
  // Turning pages of cards, and the screensaver's clock moving.
  window.setInterval(function () {
    if (saverOn) drawSaver();
    else if (cards().length > PER_PAGE && !overlay) render();
  }, PAGE_MS);
  tick();
})();
