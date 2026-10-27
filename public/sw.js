/*
 * Latchkey's service worker.
 * - Keeps the app shell, static files and the last good copy of public
 *   pages (kiosk, check-in, room guides) so a front-door tablet survives
 *   patchy Wi-Fi. Never caches data, sign-in or server calls.
 * - Shows push alerts: pushes arrive without content, so the worker asks
 *   Latchkey for the newest alert for this device and shows that.
 */
const VERSION = "lk-v4";
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const META = "lk-meta";
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("lk-v") && !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Pages worth keeping a copy of: the ones a tablet or guest phone shows. */
const KEEP_PAGE = /^\/(kiosk|room|checkin|stay)(\/|$)/;
/** Never touched: data, server functions, auth and tracking. */
const NEVER = /^\/(api|_serverFn|_server|auth)(\/|$)|\/__/;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && KEEP_PAGE.test(url.pathname)) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(
          async () =>
            (await caches.match(req, { cacheName: PAGES })) ||
            (await caches.match("/offline.html")) ||
            Response.error(),
        ),
    );
    return;
  }

  // Built files have their content hash in the name: once fetched, never changes.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

/* --------------------------------- push --------------------------------- */

async function deviceToken() {
  const hit = await caches.open(META).then((c) => c.match("/push-token"));
  return hit ? hit.text() : null;
}

self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "push-token" && typeof d.token === "string") {
    event.waitUntil(caches.open(META).then((c) => c.put("/push-token", new Response(d.token))));
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let alert = {
        title: "New alert",
        body: "Something needs you. Tap to open Today.",
        url: "/app/today",
        tag: "latchkey",
      };
      try {
        const token = await deviceToken();
        if (token) {
          const res = await fetch(`/api/public/push/latest?t=${encodeURIComponent(token)}`, {
            cache: "no-store",
          });
          if (res.ok) alert = { ...alert, ...(await res.json()) };
        }
      } catch (e) {
        // Offline: the general message still tells the host to look.
      }
      await self.registration.showNotification(alert.title, {
        body: alert.body,
        tag: alert.tag,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: alert.url },
        renotify: true,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/app/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
