import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { extrasCopy as copy } from "@/content/copy";
import { decideExtrasRequest, listExtrasRequests } from "@/lib/extras.functions";
import { formatPence } from "@/lib/services";

export function ExtrasInbox({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(listExtrasRequests);
  const decide = useServerFn(decideExtrasRequest);
  const q = useQuery({ queryKey: ["extras-inbox", propertyId], queryFn: () => fn({ data: { propertyId } }), refetchInterval: 20_000 });

  async function act(id: string, action: "approve" | "decline" | "suggest" | "delivered" | "mark_paid", window: "asap" | "evening" | "morning" | "door" | null = null) {
    try {
      await decide({ data: { id, action, window } });
      await qc.invalidateQueries({ queryKey: ["extras-inbox", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  return (
    <section className="card-soft p-5">
      <h2 className="text-lg">{copy.inbox}</h2>
      {q.isLoading ? <Skeleton className="mt-4 h-32 rounded-2xl" /> : !q.data?.length ? (
        <p className="mt-2 text-muted-foreground">{copy.inboxEmpty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {q.data.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.guest}{r.room ? ` · ${r.room}` : ""}</span>
                <span className="rounded-full bg-secondary px-3 py-0.5 text-sm">{copy.statuses[r.status] ?? r.status}</span>
                {r.totalPence > 0 ? <span className="ml-auto font-medium">{formatPence(r.totalPence)}</span> : <span className="ml-auto text-sm text-muted-foreground">{copy.free}</span>}
              </div>
              <p className="mt-1">{r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
              <p className="text-sm text-muted-foreground">
                {r.window ? copy.windows[r.window] : null}
                {r.lateUntil ? ` · ${copy.until(r.lateUntil.slice(0, 5))}` : ""}
                {r.earlyFrom ? ` · ${copy.from(r.earlyFrom.slice(0, 5))}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status === "requested" ? (
                  <>
                    <Button size="sm" onClick={() => act(r.id, "approve")}>{copy.approve}</Button>
                    <Button size="sm" variant="outline" onClick={() => act(r.id, "suggest", "evening")}>{copy.suggest}: {copy.windows["evening"]}</Button>
                    <Button size="sm" variant="outline" onClick={() => act(r.id, "suggest", "morning")}>{copy.suggest}: {copy.windows["morning"]}</Button>
                    <Button size="sm" variant="ghost" onClick={() => act(r.id, "decline")}>{copy.decline}</Button>
                  </>
                ) : null}
                {r.status === "awaiting_payment" ? <Button size="sm" variant="outline" onClick={() => act(r.id, "mark_paid")}>{copy.markPaid}</Button> : null}
                {r.status === "approved" || r.status === "confirmed" ? <Button size="sm" onClick={() => act(r.id, "delivered")}>{copy.delivered}</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
