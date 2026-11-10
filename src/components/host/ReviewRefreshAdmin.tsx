import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { SaveButton } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { common, reviewRefreshCopy as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import {
  getReviewRefresh,
  refreshReviewsNow,
  setReviewRefreshDays,
} from "@/lib/kiosk-reviews.functions";

/**
 * Latchkey admin → System: how often door tablet reviews are read again (days, 7 unless
 * changed), to balance Firecrawl use, and Fetch now for chosen properties or all of them.
 */
export function ReviewRefreshAdmin() {
  const getFn = useServerFn(getReviewRefresh);
  const daysFn = useServerFn(setReviewRefreshDays);
  const nowFn = useServerFn(refreshReviewsNow);
  const q = useQuery({ queryKey: ["admin-review-refresh"], queryFn: () => getFn() });
  const [days, setDays] = useState(7);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"days" | "now" | null>(null);
  useEffect(() => {
    if (q.data) setDays(q.data.days);
  }, [q.data]);
  const props = q.data?.properties ?? [];
  const all = props.length > 0 && picked.size === props.length;

  async function act(which: "days" | "now", fn: () => Promise<string>) {
    setBusy(which);
    try {
      toast.success(await fn());
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-1 font-display text-xl">
          {copy.title}
          <InfoTip label={copy.title}>{copy.info}</InfoTip>
        </h2>
        <SaveButton
          dirty={!!q.data && days !== q.data.days}
          busy={busy === "days"}
          onClick={() =>
            void act("days", async () => {
              await daysFn({ data: { days } });
              return copy.saved;
            })
          }
        />
      </div>
      {q.data && !q.data.canFetch ? <p className="text-sm text-destructive">{copy.off}</p> : null}
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {copy.every}
        <Input
          type="number"
          min={1}
          max={30}
          className="w-24"
          value={days}
          onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
        />
        {copy.days}
      </label>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={all}
              disabled={!props.length}
              onCheckedChange={(v) => setPicked(v ? new Set(props.map((p) => p.id)) : new Set())}
            />
            {copy.all(props.length)}
          </label>
          <Button
            disabled={!picked.size || busy !== null || !q.data?.canFetch}
            onClick={() =>
              void act("now", async () => {
                const r = await nowFn({ data: { propertyIds: all ? null : [...picked] } });
                return copy.done(r.done, r.failed, r.skipped);
              })
            }
          >
            {busy === "now" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {copy.now(picked.size)}
          </Button>
        </div>
        {props.length ? (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {props.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Checkbox
                  checked={picked.has(p.id)}
                  aria-label={p.name}
                  onCheckedChange={(v) =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (v) n.add(p.id);
                      else n.delete(p.id);
                      return n;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.showing ? copy.showing : copy.notShowing} ·{" "}
                  {p.lastFetched
                    ? copy.last(formatUkDate(p.lastFetched.slice(0, 10)), p.kept ?? 0)
                    : copy.never}
                  {p.error ? ` · ${p.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.none}</p>
        )}
      </div>
    </section>
  );
}
