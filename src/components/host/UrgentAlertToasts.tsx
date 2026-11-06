import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useAlerts } from "@/hooks/use-host-data";
import { URGENT, alertPath, alertTitle, type AlertKind } from "@/lib/notify";

const SEEN_KEY = "latchkey.urgentSeen";

/**
 * Anywhere in the dashboard: each new urgent alert (an ID that doesn't match, a guest with no
 * booking found, locked out…) pops up once, with a button to the stay. The bell and Today keep it.
 */
export function UrgentAlertToasts() {
  const alerts = useAlerts();
  const navigate = useNavigate();
  const opened = useRef(Date.now());
  // Checked more often than the bell, so the host hears about a guest at the door quickly.
  useEffect(() => {
    const id = window.setInterval(() => void alerts.refetch(), 20_000);
    return () => window.clearInterval(id);
  }, [alerts]);
  useEffect(() => {
    const list = alerts.data?.alerts ?? [];
    let seen: string[] = [];
    try {
      seen = JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[];
    } catch {
      seen = [];
    }
    const fresh = list.filter(
      (a) =>
        URGENT.includes(a.kind as AlertKind) &&
        !seen.includes(a.id) &&
        // Only what arrives while the dashboard is open (a few minutes' grace on opening).
        Date.parse(a.created_at) > opened.current - 5 * 60_000,
    );
    if (!fresh.length) return;
    for (const a of fresh) {
      toast.error(alertTitle(a.kind), {
        description: a.message,
        duration: 30_000,
        action: {
          label: "Open",
          onClick: () => void navigate({ href: alertPath(a.kind, a.booking_id ?? null) }),
        },
      });
    }
    try {
      window.sessionStorage.setItem(
        SEEN_KEY,
        JSON.stringify([...seen, ...fresh.map((a) => a.id)].slice(-100)),
      );
    } catch {
      // Not remembered: it may show again after a reload.
    }
  }, [alerts.data, navigate]);
  return null;
}
