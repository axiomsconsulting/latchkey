import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { extrasCopy, todayRequests as copy } from "@/content/copy";
import { decideExtrasRequest, listExtrasRequests } from "@/lib/extras.functions";
import { formatPence } from "@/lib/services";

/** Requests still waiting on the host, with one-tap approve or decline. */
export function TodayRequests({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listExtrasRequests);
  const decide = useServerFn(decideExtrasRequest);
  const q = useQuery({
    queryKey: ["extras-inbox", propertyId],
    queryFn: () => list({ data: { propertyId } }),
    refetchInterval: 30_000,
  });
  const waiting = (q.data ?? []).filter((r) => r.status === "requested");
  if (waiting.length === 0) return null;

  async function act(id: string, action: "approve" | "decline") {
    try {
      await decide({ data: { id, action, window: null, note: null } });
      await qc.invalidateQueries({ queryKey: ["extras-inbox", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
      <p className="font-medium">{copy.title}</p>
      <ul className="mt-2 space-y-2">
        {waiting.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              {r.guest}
              {r.room ? ` · ${r.room}` : ""} · {r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
              {r.totalPence > 0 ? ` · ${formatPence(r.totalPence)}` : ""}
            </span>
            <Button size="sm" onClick={() => act(r.id, "approve")}>
              {extrasCopy.approve}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act(r.id, "decline")}>
              {extrasCopy.decline}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
