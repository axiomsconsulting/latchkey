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
export function useSelectedProperty(properties: Array<{ id: string; name: string }> | undefined) {
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    setStored(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  const selectedId = useMemo(() => {
    if (!properties || properties.length === 0) return null;
    if (stored && properties.some((p) => p.id === stored)) return stored;
    return properties[0]!.id;
  }, [properties, stored]);

  function select(id: string) {
    window.localStorage.setItem(STORAGE_KEY, id);
    setStored(id);
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
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => fn(),
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
