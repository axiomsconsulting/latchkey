import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Loader2, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";

import { guestGuideIcons } from "@/components/guest/guide-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { common, guideCopy as copy } from "@/content/copy";
import { DEFAULT_PINNED, SECTIONS, type SectionKey } from "@/lib/guide";
import { reorderSections, setSectionPin } from "@/lib/guide.functions";

type Row = { sectionKey: SectionKey; pinned: boolean };

/**
 * One list that decides both the reminder card at the top of a guest's guide
 * and the running order underneath it. Pinned sections only ever appear in
 * the card, so guests never read the same rule twice.
 */
export function GuideOrderPanel({ propertyId, order, pinned }: { propertyId: string; order: SectionKey[]; pinned: Set<SectionKey> }) {
  const qc = useQueryClient();
  const pin = useServerFn(setSectionPin);
  const reorder = useServerFn(reorderSections);
  const [busy, setBusy] = useState<string | null>(null);

  const anyPinned = pinned.size > 0;
  const rows: Row[] = order.map((k) => ({ sectionKey: k, pinned: anyPinned ? pinned.has(k) : DEFAULT_PINNED.includes(k) }));
  const pinnedCount = rows.filter((r) => r.pinned).length;

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["guide", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = rows.map((r) => r.sectionKey);
    [next[i], next[j]] = [next[j]!, next[i]!];
    void run(`move-${i}`, () => reorder({ data: { propertyId, order: next } }));
  }

  function togglePin(row: Row) {
    // The first pin makes the host's choice explicit, so the stand-in
    // reminders stop applying: keep the ones already showing.
    if (!anyPinned && !row.pinned) {
      const keep = rows.filter((r) => r.pinned).map((r) => r.sectionKey);
      void run(`pin-${row.sectionKey}`, async () => {
        for (const k of [...keep, row.sectionKey]) await pin({ data: { propertyId, sectionKey: k, pinned: true } });
      });
      return;
    }
    void run(`pin-${row.sectionKey}`, () => pin({ data: { propertyId, sectionKey: row.sectionKey, pinned: !row.pinned } }));
  }

  return (
    <section className="card-soft p-4">
      <h2 className="text-lg">{copy.orderTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.pinHelp}</p>
      {pinnedCount > 4 ? <p className="mt-2 text-sm text-accent">{copy.pinLimit}</p> : null}
      <ul className="mt-3 space-y-2">
        {rows.map((row, i) => {
          const Icon = guestGuideIcons[row.sectionKey];
          const title = SECTIONS.find((s) => s.key === row.sectionKey)!.title;
          return (
            <li key={row.sectionKey} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2">
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {row.pinned ? <Badge variant="secondary">{copy.pinnedBadge}</Badge> : null}
              <Button
                type="button"
                size="icon"
                variant={row.pinned ? "default" : "ghost"}
                aria-label={copy.pinLabel}
                aria-pressed={row.pinned}
                disabled={busy !== null}
                onClick={() => togglePin(row)}
              >
                {busy === `pin-${row.sectionKey}` ? <Loader2 className="size-4 animate-spin" /> : row.pinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label={copy.moveUp} disabled={i === 0 || busy !== null} onClick={() => move(i, -1)}>
                <ArrowUp className="size-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label={copy.moveDown} disabled={i === rows.length - 1 || busy !== null} onClick={() => move(i, 1)}>
                <ArrowDown className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
