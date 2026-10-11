import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { team as copy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import { displayRole } from "@/lib/roles";
import { setActiveHost } from "@/lib/team.functions";

const PROPERTY_KEY = "latchkey.property";

/** Clears per-host browser state so one host's property never shows in another. */
function forgetProperty() {
  try {
    window.localStorage.removeItem(PROPERTY_KEY);
  } catch {
    // Private mode: nothing stored anyway.
  }
}

/** Switch between hosts this person belongs to. Hidden when there is only one. */
export function HostSwitcher({ className }: { className?: string }) {
  const { data } = useWorkspace();
  const switchHost = useServerFn(setActiveHost);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const memberships = data?.memberships ?? [];

  if (!data || memberships.length < 2) return null;

  async function choose(hostId: string) {
    if (hostId === data?.hostId) return;
    setBusy(true);
    try {
      await switchHost({ data: { hostId } });
      forgetProperty();
      // Drop every cached board, booking and alert from the previous host.
      await qc.resetQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      await qc.invalidateQueries({ queryKey: ["workspace"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Select value={data.hostId} onValueChange={(v) => void choose(v)} disabled={busy}>
      <SelectTrigger className={className} aria-label={copy.switchHost}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {memberships.map((m) => (
          <SelectItem key={m.hostId} value={m.hostId}>
            {m.businessName || "Untitled"} · {copy.roles[displayRole(m.role)]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Tells people when the host they were looking at disappears from their list
 * (an owner removed them), instead of silently showing a different host.
 */
export function useAccessWatch() {
  const { data } = useWorkspace();
  const last = useRef<{ hostId: string; name: string } | null>(null);
  useEffect(() => {
    if (!data || data.pendingInvite) return;
    const prev = last.current;
    const name = (data.host as { business_name?: string } | null)?.business_name ?? "";
    if (prev && prev.hostId !== data.hostId && !data.memberships.some((m) => m.hostId === prev.hostId)) {
      forgetProperty();
      toast.message(copy.accessRemoved(prev.name || "that host"));
    }
    last.current = { hostId: data.hostId, name };
  }, [data]);
}
