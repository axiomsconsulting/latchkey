import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { channels } from "@/content/copy";
import { resolveSites, type Site } from "@/lib/booking-sites";
import { getPropertyBoard, getWorkspace, listAlerts, listConnections } from "@/lib/host.functions";
import { canWrite, isOwner } from "@/lib/roles";
import { linkState } from "@/lib/sync-status";

const STORAGE_KEY = "latchkey.property";

export function useWorkspace() {
  const fn = useServerFn(getWorkspace);
  return useQuery({
    queryKey: ["workspace"],
    queryFn: () => fn(),
  });
}

/** What the signed-in person may do in the active host. */
export function useRole() {
  const { data } = useWorkspace();
  const role = data?.role ?? null;
  return { role, canWrite: canWrite(role), isOwner: isOwner(role), loading: !data };
}

/** Remembers which property the host was last looking at. */
const PROPERTY_EVENT = "latchkey:property";

/** Opens the dashboard on this property next (the regional demo links). */
export function rememberSelectedProperty(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
    window.dispatchEvent(new Event(PROPERTY_EVENT));
  } catch {
    // Storage blocked: the dashboard opens on its first property instead.
  }
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The property the dashboard is showing. Shared by every part of the screen,
 * so picking one in the menu updates the page underneath straight away, and
 * remembered in this browser.
 */
export function useSelectedProperty(properties: Array<{ id: string; name: string }> | undefined) {
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    setStored(readStored());
    const sync = () => setStored(readStored());
    window.addEventListener(PROPERTY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PROPERTY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const selectedId = useMemo(() => {
    if (!properties || properties.length === 0) return null;
    if (stored && properties.some((p) => p.id === stored)) return stored;
    return properties[0]!.id;
  }, [properties, stored]);

  function select(id: string) {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Not remembered, but this screen still switches.
    }
    setStored(id);
    window.dispatchEvent(new Event(PROPERTY_EVENT));
  }

  return { selectedId, select };
}

export function usePropertyBoard(propertyId: string | null) {
  const fn = useServerFn(getPropertyBoard);
  return useQuery({
    queryKey: ["board", propertyId],
    enabled: Boolean(propertyId),
    queryFn: () => fn({ data: { propertyId: propertyId! } }),
  });
}

export function useConnections(propertyId: string | null) {
  const fn = useServerFn(listConnections);
  return useQuery({
    queryKey: ["connections", propertyId],
    enabled: Boolean(propertyId),
    queryFn: () => fn({ data: { propertyId: propertyId! } }),
    // Keep the "Syncing…" badges honest while a sync runs.
    refetchInterval: (q) =>
      (q.state.data?.connections ?? []).some((c) => linkState(c as { sync_status: string; sync_started_at?: string | null }) === "syncing")
        ? 4000
        : false,
  });
}

export function useAlerts() {
  const fn = useServerFn(listAlerts);
  const hostId = useWorkspace().data?.hostId ?? null;
  return useQuery({
    queryKey: ["alerts", hostId],
    enabled: Boolean(hostId),
    queryFn: () => fn({ data: { hostId: hostId! } }),
    refetchInterval: 60_000,
  });
}

/** The host's booking sites: built-ins with their wording and icons, then any they added. */
export function useBookingSites(): Site[] {
  const { data } = useWorkspace();
  const host = data?.host as { channel_labels?: Record<string, string>; booking_sites?: unknown } | null | undefined;
  return useMemo(
    () => resolveSites(host?.channel_labels ?? {}, host?.booking_sites, channels),
    [host?.channel_labels, host?.booking_sites],
  );
}
