import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPropertyBoard, getWorkspace, listConnections } from "@/lib/host.functions";

const STORAGE_KEY = "latchkey.property";

export function useWorkspace() {
  const fn = useServerFn(getWorkspace);
  return useQuery({
    queryKey: ["workspace"],
    queryFn: () => fn(),
  });
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
  });
}
