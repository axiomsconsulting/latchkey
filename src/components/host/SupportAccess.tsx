import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { common, supportCopy as copy } from "@/content/copy";
import { setSupportAccess } from "@/lib/admin.functions";
import { formatUkDate } from "@/lib/dates";

/**
 * The owner decides whether Latchkey support may make changes: on for 30
 * days at a time, off whenever they like. Without it support is read-only.
 */
export function SupportAccess({ hostId, until, isOwner }: { hostId: string; until: string | null | undefined; isOwner: boolean }) {
  const save = useServerFn(setSupportAccess);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const on = !!until && Date.parse(until) > Date.now();

  async function set(allow: boolean) {
    setBusy(true);
    try {
      await save({ data: { hostId, allow } });
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      toast.success(allow ? copy.allowed : copy.stopped);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <LifeBuoy className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
          {on ? <p className="mt-2 text-sm font-medium">{copy.until(formatUkDate(until!.slice(0, 10), { withYear: true }))}</p> : null}
        </div>
      </div>
      {isOwner ? (
        <Button className="mt-4 h-auto min-h-10 whitespace-normal py-2 text-left" variant={on ? "outline" : "default"} disabled={busy} onClick={() => void set(!on)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {on ? copy.stop : copy.allow}
        </Button>
      ) : null}
    </section>
  );
}
