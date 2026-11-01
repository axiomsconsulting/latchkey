import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setupCopy as copy } from "@/content/copy";
import { checklist, type SetupStep } from "@/lib/setup-checklist";
import { getSetupFacts } from "@/lib/setup.functions";
import { cn } from "@/lib/utils";

/** Where each step is done (each page lands on the right part). */
const WHERE: Record<SetupStep, { to: string; search?: Record<string, string> }> = {
  rooms: { to: "/app/properties" },
  calendar: { to: "/app/connections" },
  pin: { to: "/app/properties" },
  guide: { to: "/app/guides" },
  tablet: { to: "/app/settings", search: { focus: "kioskTablets" } },
  payments: { to: "/app/settings", search: { focus: "payments" } },
};

type Kept = { skipped: string[]; hidden: boolean };
const key = (propertyId: string) => `latchkey.setup.${propertyId}`;
function read(propertyId: string): Kept {
  try {
    const v = JSON.parse(window.localStorage.getItem(key(propertyId)) ?? "null") as Kept | null;
    return { skipped: Array.isArray(v?.skipped) ? v.skipped : [], hidden: v?.hidden === true };
  } catch {
    return { skipped: [], hidden: false };
  }
}

/**
 * Today's getting-started card (rules in src/lib/setup-checklist.ts): each
 * step ticks itself off from what's really set up, optional ones can be
 * skipped, and the card goes once nothing is left (or the host hides it,
 * remembered in this browser).
 */
export function SetupChecklist({ propertyId }: { propertyId: string }) {
  const fn = useServerFn(getSetupFacts);
  const q = useQuery({
    queryKey: ["setup-facts", propertyId],
    queryFn: () => fn({ data: { propertyId } }),
    staleTime: 60_000,
  });
  const [kept, setKept] = useState<Kept>({ skipped: [], hidden: true });
  useEffect(() => setKept(read(propertyId)), [propertyId]);
  const save = (k: Kept) => {
    setKept(k);
    try {
      window.localStorage.setItem(key(propertyId), JSON.stringify(k));
    } catch {
      // Private browsing: it simply shows again next time.
    }
  };
  if (!q.data || kept.hidden) return null;
  const c = checklist(q.data, kept.skipped);
  if (c.left === 0) return null;
  return (
    <section className="card-soft space-y-3 p-5" aria-labelledby="setup-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="setup-title" className="flex items-center gap-2 font-display text-xl">
          <Rocket className="size-5 text-primary" aria-hidden /> {copy.title}
          <span className="text-sm font-normal text-muted-foreground">
            {copy.progress(c.done, c.items.length)}
          </span>
        </h2>
        <Button variant="ghost" size="sm" onClick={() => save({ ...kept, hidden: true })}>
          {copy.hide}
        </Button>
      </div>
      <ol className="grid items-start gap-2 md:grid-cols-2">
        {c.items
          .filter((i) => !i.done)
          .map((i) => {
            const [title, why] = copy.steps[i.step]!;
            const where = WHERE[i.step];
            return (
              <li
                key={i.step}
                className={cn(
                  "flex items-start gap-3 rounded-xl border border-border p-3",
                  (i.done || i.skipped) && "opacity-60",
                )}
              >
                {i.done ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", i.done && "line-through")}>{title}</p>
                  {i.done || i.skipped ? null : (
                    <p className="text-sm text-muted-foreground">{why}</p>
                  )}
                  {i.done ? null : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {i.skipped ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            save({ ...kept, skipped: kept.skipped.filter((s) => s !== i.step) })
                          }
                        >
                          {copy.undo}
                        </Button>
                      ) : (
                        <>
                          <Button asChild size="sm">
                            <Link to={where.to as never} search={(where.search ?? {}) as never}>
                              {copy.go}
                            </Link>
                          </Button>
                          {i.optional ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => save({ ...kept, skipped: [...kept.skipped, i.step] })}
                            >
                              {copy.skip}
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
      </ol>
      {c.done ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {copy.doneList(c.items.filter((i) => i.done).map((i) => copy.steps[i.step]![0]))}
        </p>
      ) : null}
    </section>
  );
}
