import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, EyeOff, GripVertical, Loader2, Pin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { sectionIcon } from "@/components/guest/guide-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { common, guideCopy as copy } from "@/content/copy";
import { DEFAULT_PINNED, type EditorSection, type SectionKey } from "@/lib/guide";
import { addGuideSection, removeGuideSection, reorderSections, setSectionPin } from "@/lib/guide.functions";
import { moveItem } from "@/lib/reorder";
import { cn } from "@/lib/utils";

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The guide as one list in the order guests read it. Each section stays
 * folded until opened; drag the grab bar to move it (mouse, touch or arrow
 * keys). Pin a section to the reminder card, remove it, or add one back or
 * of your own.
 */
export function GuideSectionList({
  propertyId,
  shown,
  removed,
  pinned,
  manage,
  openKey,
  badges,
  children,
  attachmentCount = () => 0,
}: {
  propertyId: string;
  shown: EditorSection[];
  removed: EditorSection[];
  pinned: Set<SectionKey>;
  /** Pinning, removing and adding change the whole-property guide. */
  manage: boolean;
  openKey: string | null;
  badges: (s: EditorSection) => ReactNode;
  children: (s: EditorSection) => ReactNode;
  /** How many photos and documents a section has: removing it deletes them, so it asks first. */
  attachmentCount?: (key: SectionKey) => number;
}) {
  const qc = useQueryClient();
  const reorder = useServerFn(reorderSections);
  const pin = useServerFn(setSectionPin);
  const add = useServerFn(addGuideSection);
  const remove = useServerFn(removeGuideSection);
  const [order, setOrder] = useState<SectionKey[]>(shown.map((s) => s.key));
  const [open, setOpen] = useState<string | null>(openKey);
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [confirm, setConfirm] = useState<EditorSection | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!dragging) setOrder(shown.map((s) => s.key));
  }, [shown, dragging]);
  useEffect(() => setOpen(openKey), [openKey]);

  const byKey = new Map(shown.map((s) => [s.key, s]));
  const anyPinned = pinned.size > 0;
  const isPinned = (k: SectionKey) => (anyPinned ? pinned.has(k) : DEFAULT_PINNED.includes(k));

  async function run(name: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(name);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["guide", propertyId] });
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }
  const save = (keys: SectionKey[]) => run("order", () => reorder({ data: { propertyId, order: keys } }));

  function startDrag(e: React.PointerEvent<HTMLButtonElement>, key: SectionKey) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setDragging(key);
    let current = order;
    const move = (ev: PointerEvent) => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLLIElement>("li[data-key]") ?? [])];
      const over = rows.findIndex((r) => {
        const b = r.getBoundingClientRect();
        return ev.clientY >= b.top && ev.clientY <= b.bottom;
      });
      const from = current.indexOf(key);
      if (over >= 0 && over !== from) {
        current = moveItem(current, from, over);
        setOrder(current);
      }
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragging(null);
      if (current.join() !== order.join()) void save(current);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function togglePin(key: SectionKey) {
    // The first pin makes the host's choice explicit, so keep the stand-ins showing.
    if (!anyPinned && !isPinned(key)) {
      const keep = order.filter((k) => DEFAULT_PINNED.includes(k));
      return run(`pin-${key}`, async () => {
        for (const k of [...keep, key]) await pin({ data: { propertyId, sectionKey: k, pinned: true } });
      });
    }
    return run(`pin-${key}`, () => pin({ data: { propertyId, sectionKey: key, pinned: !isPinned(key) } }));
  }

  const pinnedCount = order.filter(isPinned).length;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3" data-tour="guides-sections">
        {pinnedCount > 4 ? <p className="text-sm text-accent">{copy.pinLimit}</p> : null}
        <ul ref={listRef} className="space-y-2">
          {order.map((key, index) => {
            const s = byKey.get(key);
            if (!s) return null;
            const Icon = sectionIcon(key);
            const isOpen = open === key;
            return (
              <li key={key} data-key={key} id={`guide-${key}`} className={cn("card-soft scroll-mt-24 overflow-hidden", dragging === key && "relative z-10 shadow-lifted ring-2 ring-primary/40")}>
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <Tip label={copy.dragTip}>
                    <button
                      type="button"
                      className="grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
                      aria-label={copy.dragLabel(s.title)}
                      onPointerDown={(e) => startDrag(e, key)}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                        e.preventDefault();
                        const next = moveItem(order, index, index + (e.key === "ArrowUp" ? -1 : 1));
                        if (next !== order) {
                          setOrder(next);
                          void save(next);
                        }
                      }}
                    >
                      <GripVertical className="size-4" />
                    </button>
                  </Tip>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    className="flex min-h-12 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 truncate font-display text-lg">{s.title}</span>
                    </span>
                    {badges(s)}
                  </button>
                  {manage ? (
                    <>
                      <Tip label={isPinned(key) ? copy.unpinTip : copy.pinTip}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn("size-9 shrink-0", isPinned(key) ? "text-accent" : "text-muted-foreground")}
                          aria-pressed={isPinned(key)}
                          aria-label={isPinned(key) ? copy.unpinTip : copy.pinTip}
                          disabled={busy !== null}
                          onClick={() => void togglePin(key)}
                        >
                          {busy === `pin-${key}` ? <Loader2 className="size-4 animate-spin" /> : <Pin className={cn("size-4", isPinned(key) && "fill-current")} />}
                        </Button>
                      </Tip>
                      <Tip label={s.custom ? copy.deleteTip : copy.removeTip}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`${s.custom ? copy.deleteTip : copy.removeTip}: ${s.title}`}
                          disabled={busy !== null}
                          onClick={() =>
                            s.custom || attachmentCount(key) > 0
                              ? setConfirm(s)
                              : void run(`rm-${key}`, () => remove({ data: { propertyId, sectionKey: key } }), copy.removedToast(s.title))
                          }
                        >
                          {s.custom ? <Trash2 className="size-4" /> : <EyeOff className="size-4" />}
                        </Button>
                      </Tip>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : key)}
                    aria-label={isOpen ? copy.foldTip(s.title) : copy.openTip(s.title)}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                  >
                    <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                  </button>
                </div>
                {isOpen ? <div className="border-t border-border px-4 pb-4 pt-3">{children(s)}</div> : null}
              </li>
            );
          })}
        </ul>

        {manage ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Plus className="size-4" /> {copy.addSection}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 space-y-3 rounded-2xl">
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTitle.trim()) return;
                  void run(
                    "add",
                    async () => {
                      const r = await add({ data: { propertyId, title: newTitle.trim() } });
                      setOpen(r.key);
                      setNewTitle("");
                    },
                    copy.addedToast,
                  );
                }}
              >
                <p className="text-sm font-medium">{copy.ownSection}</p>
                <div className="flex gap-2">
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={80} placeholder={copy.ownSectionPlaceholder} />
                  <Button type="submit" disabled={!newTitle.trim() || busy !== null}>
                    {copy.add}
                  </Button>
                </div>
              </form>
              {removed.length ? (
                <div className="border-t border-border pt-3">
                  <p className="mb-1 text-sm font-medium">{copy.addBack}</p>
                  <ul className="space-y-0.5">
                    {removed.map((s) => {
                      const Icon = sectionIcon(s.key);
                      return (
                        <li key={s.key}>
                          <button
                            type="button"
                            disabled={busy !== null}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                            onClick={() => void run(`add-${s.key}`, () => add({ data: { propertyId, sectionKey: s.key } }), copy.addedBack(s.title))}
                          >
                            <Icon className="size-4 text-primary" /> {s.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => (o ? null : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.deleteTitle(confirm?.title ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.custom ? copy.deleteBody : copy.removeWithFiles}
              {confirm && attachmentCount(confirm.key) > 0 ? ` ${copy.filesGoToo(attachmentCount(confirm.key))}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                confirm &&
                void run(`rm-${confirm.key}`, () => remove({ data: { propertyId, sectionKey: confirm.key } }), confirm.custom ? copy.deletedToast : copy.removedToast(confirm.title))
              }
            >
              {confirm?.custom ? copy.deleteConfirm : copy.removeConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
