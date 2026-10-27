/**
 * The launch funnel (analytics_events): tour_view, tour_complete,
 * demo_host_view, trial_signup_started, trial_signup_completed. Each is sent
 * at most once per visit (a session flag), with the session's utm_*, and
 * only once the visitor has accepted statistics (cookie banner or /privacy),
 * never with GPC, DNT or ?notrack=1.
 */
import type { EventName } from "./analytics";
import { sessionUtm } from "./attribution";
import { send, trackingOff, visitorId } from "@/components/VisitTracker";

export function trackEvent(name: EventName, props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  try {
    if (trackingOff()) return;
    const key = `lk_ev_${name}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked: still count it, at worst twice.
  }
  send({
    t: "event",
    name,
    v: visitorId(),
    id: crypto.randomUUID(),
    path: window.location.pathname,
    utm: sessionUtm(),
    ...(props ? { props } : {}),
  });
}
