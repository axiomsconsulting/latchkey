/**
 * Is there a newer version, and should this page reload now? Checks
 * /api/public/version every few minutes (and when the page comes back into
 * view), shows Update when it's newer, and reloads by itself when an update
 * was asked for (src/lib/app-update.ts) once nobody has touched the page for
 * 15 minutes and nothing on it is busy. Browser only.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  CHECK_MINUTES,
  newerVersion,
  normaliseUpdates,
  shouldReload,
  upcomingUpdate,
  updateDue,
  type Audience,
  type UpdateRequests,
} from "@/lib/app-update";
import { APP_VERSION } from "@/lib/app-version";

// When this copy of the app started, and when someone last used it.
const loadedAt = Date.now();
let lastInput = Date.now();
let listening = false;
function trackInput() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const mark = () => {
    lastInput = Date.now();
  };
  for (const e of ["pointerdown", "keydown", "wheel", "touchstart"] as const)
    window.addEventListener(e, mark, { passive: true, capture: true });
}

/** Fresh from the server: the new service worker too, then the page. */
export async function reloadToUpdate() {
  try {
    await (await navigator.serviceWorker?.getRegistration())?.update();
  } catch {
    // Not installed as an app: a plain reload is enough.
  }
  window.location.reload();
}

export function useAppUpdate(o: {
  audience: Audience;
  /** Other update requests for this device (a host asking for their tablet). */
  extra?: Array<string | null | undefined>;
  /** Someone is in the middle of something here: never reload. */
  busy?: boolean;
  enabled?: boolean;
}) {
  const [latest, setLatest] = useState<string | null>(null);
  const [updates, setUpdates] = useState<UpdateRequests>({ hosts: null, kiosks: null });
  const live = useRef(o);
  live.current = o;

  const check = useCallback(() => {
    void fetch("/api/public/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { version?: string; updates?: unknown } | null) => {
        if (!j) return;
        if (typeof j.version === "string") setLatest(j.version);
        setUpdates(normaliseUpdates(j.updates));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (o.enabled === false) return;
    trackInput();
    check();
    const id = window.setInterval(check, CHECK_MINUTES * 60_000);
    const onShow = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [check, o.enabled]);

  // Every half minute: reload if an update is due and nobody has used this for 15 minutes.
  useEffect(() => {
    if (o.enabled === false) return;
    const tick = () => {
      const now = Date.now();
      const cur = live.current;
      const due = updateDue([updates[cur.audience], ...(cur.extra ?? [])], loadedAt, now);
      if (shouldReload({ due, idleMs: now - lastInput, busy: !!cur.busy })) void reloadToUpdate();
    };
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [updates, o.enabled]);

  return {
    current: APP_VERSION,
    latest,
    available: newerVersion(latest, APP_VERSION),
    /** A scheduled update coming within the day, to tell people about. */
    upcoming: upcomingUpdate([updates[o.audience], ...(o.extra ?? [])], Date.now()),
  };
}

/** Just the newest published version (for marking tablets that run an older one). */
export function useLatestVersion(): string | null {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/public/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { version?: string } | null) => j?.version && setLatest(j.version))
      .catch(() => {});
  }, []);
  return latest;
}
