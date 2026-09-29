import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { extrasCopy as copy, responseNotes } from "@/content/copy";
import { decideExtrasRequest, listExtrasRequests } from "@/lib/extras.functions";
import { formatPence } from "@/lib/services";

type Action = "approve" | "decline" | "suggest" | "delivered" | "mark_paid";
type Pending = { id: string; action: Action; window: "asap" | "evening" | "morning" | "door" | null };

export function ExtrasInbox({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(listExtrasRequests);
  const decide = useServerFn(decideExtrasRequest);
  const q = useQuery({
    queryKey: ["extras-inbox", propertyId],
    queryFn: () => fn({ data: { propertyId } }),
    refetchInterval: 20_000,
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [custom, setCustom] = useState("");

  async function send(p: Pending, note: string | null) {
    try {
      await decide({ data: { id: p.id, action: p.action, window: p.window, note } });
      await qc.invalidateQueries({ queryKey: ["extras-inbox", propertyId] });
      setPending(null);
      setCustom("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  function start(id: string, action: Action, window: Pending["window"] = null) {
    if (action === "delivered" || action === "mark_paid") {
      void send({ id, action, window }, null);
      return;
    }
    setPending({ id, action, window });
    setCustom("");
  }

  function presetsFor(action: Action) {
    if (action === "approve") return responseNotes.approve;
    if (action === "decline") return responseNotes.decline;
    return responseNotes.suggest;
  }

  return (
    <section className="card-soft p-5">
      <h2 className="text-lg">{copy.inbox}</h2>
      {q.isLoading ? (
        <Skeleton className="mt-4 h-32 rounded-2xl" />
      ) : !q.data?.length ? (
        <p className="mt-2 text-muted-foreground">{copy.inboxEmpty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {q.data.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {r.guest}
                  {r.room ? ` · ${r.room}` : ""}
                </span>
                <span className="rounded-full bg-secondary px-3 py-0.5 text-sm">
                  {copy.statuses[r.status] ?? r.status}
                </span>
                {r.totalPence > 0 ? (
                  <span className="ml-auto font-medium">{formatPence(r.totalPence)}</span>
                ) : (
                  <span className="ml-auto text-sm text-muted-foreground">{copy.free}</span>
                )}
              </div>
              <p className="mt-1">{r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
              <p className="text-sm text-muted-foreground">
                {r.window ? copy.windows[r.window] : null}
                {r.lateUntil ? ` · ${copy.until(r.lateUntil.slice(0, 5))}` : ""}
                {r.earlyFrom ? ` · ${copy.from(r.earlyFrom.slice(0, 5))}` : ""}
              </p>
              {r.hostNote ? (
                <p className="mt-1 text-sm text-primary">{responseNotes.fromHost(r.hostNote)}</p>
              ) : null}

              {pending && pending.id === r.id ? (
                ((p: Pending) => (
                <div className="mt-3 space-y-2 rounded-2xl border border-border p-3">
                  <p className="text-sm font-medium">{responseNotes.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {presetsFor(p.action).map((n) => (
                      <Button key={n} size="sm" variant="outline" onClick={() => send(p, n)}>
                        {n}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="h-11 flex-1"
                      value={custom}
                      placeholder={responseNotes.custom}
                      aria-label={responseNotes.custom}
                      onChange={(e) => setCustom(e.target.value)}
                    />
                    <Button size="sm" onClick={() => send(p, custom.trim() || null)}>
                      {responseNotes.send}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                      {copy.cancel}
                    </Button>
                  </div>
                </div>
                ))(pending)
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === "requested" ? (
                    <>
                      <Button size="sm" onClick={() => start(r.id, "approve")}>
                        {copy.approve}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => start(r.id, "suggest", "evening")}>
                        {copy.suggest}: {copy.windows["evening"]}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => start(r.id, "suggest", "morning")}>
                        {copy.suggest}: {copy.windows["morning"]}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => start(r.id, "decline")}>
                        {copy.decline}
                      </Button>
                    </>
                  ) : null}
                  {r.status === "awaiting_payment" ? (
                    <Button size="sm" variant="outline" onClick={() => start(r.id, "mark_paid")}>
                      {copy.markPaid}
                    </Button>
                  ) : null}
                  {r.status === "approved" || r.status === "confirmed" ? (
                    <Button size="sm" onClick={() => start(r.id, "delivered")}>
                      {copy.delivered}
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
