import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { identifyVisit } from "@/lib/analytics.functions";
import { pickUtm, sessionUtm } from "@/lib/attribution";

const VISITOR = "lk_vid";
const IDENTIFIED = "lk_vid_who";
export const NO_TRACK = "lk_no_track";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: this visit just isn't remembered.
  }
}

/** Whether this browser asked not to be counted (Global Privacy Control, Do Not Track, or our opt-out). */
export function trackingOff(): boolean {
  // A link with ?notrack=1 turns it off in this browser for good (?notrack=0 back on).
  const flag = new URLSearchParams(window.location.search).get("notrack");
  if (flag === "1") write(NO_TRACK, "1");
  if (flag === "0") write(NO_TRACK, "0");
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === "1" || read(NO_TRACK) === "1";
}

export function visitorId(): string {
  let id = read(VISITOR);
  if (!id) {
    id = crypto.randomUUID();
    write(VISITOR, id);
  }
  return id;
}

export function send(body: Record<string, unknown>) {
  const json = JSON.stringify(body);
  // text/plain keeps it a simple request; sendBeacon survives the tab closing.
  if (!navigator.sendBeacon?.("/api/public/track", new Blob([json], { type: "text/plain" }))) {
    void fetch("/api/public/track", { method: "POST", body: json, keepalive: true }).catch(() => undefined);
  }
}

/**
 * Counts page views and how long each page is looked at (only while the tab
 * is visible), and links this browser to the person once they sign in.
 * Nothing is sent when the browser asks not to be tracked.
 */
export function VisitTracker() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const identify = useServerFn(identifyVisit);
  const view = useRef<{ id: string; path: string; shownMs: number; since: number | null } | null>(null);

  // Time on the current page, counting only while it's on screen.
  const elapsed = () => {
    const v = view.current;
    if (!v) return 0;
    return v.shownMs + (v.since !== null ? Date.now() - v.since : 0);
  };
  const leave = () => {
    const v = view.current;
    if (v) send({ t: "leave", v: visitorId(), id: v.id, ms: elapsed() });
  };

  useEffect(() => {
    if (trackingOff() || path.startsWith("/api/")) return;
    // Already counting this page (React runs effects twice in development).
    if (view.current?.path === path) return;
    leave();
    const id = crypto.randomUUID();
    view.current = { id, path, shownMs: 0, since: document.visibilityState === "visible" ? Date.now() : null };
    const params = new URLSearchParams(window.location.search);
    // An old-style ?ref= link still names its source.
    if (!params.get("utm_source") && params.get("ref")) params.set("utm_source", params.get("ref")!);
    let ref = document.referrer;
    try {
      if (ref && new URL(ref).host === window.location.host) ref = "";
    } catch {
      ref = "";
    }
    send({
      t: "view",
      v: visitorId(),
      id,
      path,
      title: document.title,
      ref: ref || undefined,
      // Every utm_* (this page's, or the session's first touch), so a campaign is seen in full.
      utm: Object.keys(pickUtm(params)).length ? pickUtm(params) : sessionUtm(),
      wd: navigator.webdriver === true,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: navigator.language,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    if (trackingOff()) return;
    const onVisibility = () => {
      const v = view.current;
      if (!v) return;
      if (document.visibilityState === "hidden") {
        if (v.since !== null) v.shownMs += Date.now() - v.since;
        v.since = null;
        leave();
      } else {
        v.since = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);

    // Anonymous → known: tell the server who this is whenever that changes.
    const link = (user: { id: string; email?: string | null } | null | undefined) => {
      if (!user) return;
      const who = `${user.id}|${user.email ?? ""}`;
      if (read(IDENTIFIED) === `${visitorId()}|${who}`) return;
      void identify({ data: { visitorId: visitorId() } })
        .then(() => write(IDENTIFIED, `${visitorId()}|${who}`))
        .catch(() => undefined);
    };
    void supabase.auth.getSession().then(({ data }) => link(data.session?.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => link(session?.user));
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
