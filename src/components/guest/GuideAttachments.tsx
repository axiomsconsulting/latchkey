import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { guest as copy } from "@/content/copy";
import { swipeStep, wrapIndex } from "@/lib/guide-view";
import { cn } from "@/lib/utils";

export type Attachment = { id: string; name: string; kind: "image" | "pdf" | "doc"; url: string };

/**
 * A section's photos and documents as thumbnails in one row (it scrolls
 * sideways when there are more); any of them opens in the large viewer.
 * `large` is the gallery's size, at the end of each card.
 */
export function GuideAttachments({
  items,
  large = false,
}: {
  items: Attachment[] | undefined;
  large?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items?.length) return null;
  return (
    <>
      <ul
        className="no-scrollbar -mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
        // A sideways scroll here never swipes the gallery card it sits in.
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {items.map((a, i) => (
          <li key={a.id} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(i);
              }}
              className={cn(
                "group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                large ? "w-56" : "w-28",
              )}
              aria-label={copy.attachmentOpen(a.name)}
            >
              {a.kind === "image" ? (
                <img
                  src={a.url}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full bg-muted object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <span className="grid aspect-[4/3] w-full place-items-center bg-secondary text-primary">
                  <FileText className={large ? "size-12" : "size-8"} />
                </span>
              )}
              <span className="truncate px-2 py-1.5 text-xs">{a.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <AttachmentViewer items={items} index={open} onIndex={setOpen} />
    </>
  );
}

/**
 * The large viewer, inside the app (never a download or another site):
 * photos whole, documents as PDF pages. Swipe sideways or use the arrows to
 * go through the section's other attachments.
 */
export function AttachmentViewer({
  items,
  index,
  onIndex,
}: {
  items: Attachment[];
  index: number | null;
  onIndex: (i: number | null) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const current = index === null ? null : items[index];
  const many = items.length > 1;
  const go = (step: number) => onIndex(wrapIndex((index ?? 0) + step, items.length));
  return (
    <Dialog open={!!current} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent className="flex h-[92dvh] max-w-4xl flex-col gap-3 p-3 sm:p-4 [&>button]:hidden">
        {current ? (
          <>
            <div className="flex items-center gap-2">
              <DialogTitle className="min-w-0 flex-1 truncate text-base font-medium">
                {current.name}
              </DialogTitle>
              {many ? (
                <>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full hover:bg-muted"
                    aria-label={copy.attachmentPrev}
                    onClick={() => go(-1)}
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {(index ?? 0) + 1}/{items.length}
                  </span>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full hover:bg-muted"
                    aria-label={copy.attachmentNext}
                    onClick={() => go(1)}
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full hover:bg-muted"
                aria-label={copy.attachmentClose}
                onClick={() => onIndex(null)}
              >
                <X className="size-5" />
              </button>
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto rounded-xl bg-muted"
              onTouchStart={(e) => {
                const t = e.touches[0];
                start.current = t ? { x: t.clientX, y: t.clientY } : null;
              }}
              onTouchEnd={(e) => {
                const t = e.changedTouches[0];
                const s = start.current;
                start.current = null;
                if (!many || !t || !s) return;
                const step = swipeStep(t.clientX - s.x, t.clientY - s.y);
                if (step) go(step);
              }}
            >
              {current.kind === "image" ? (
                <img
                  key={current.id}
                  src={current.url}
                  alt={current.name}
                  className="mx-auto h-full w-auto max-w-full object-contain animate-in fade-in"
                />
              ) : (
                // Documents are shown as PDF pages, inside the app (swipe on the bar above for the next).
                <iframe
                  key={current.id}
                  src={`${current.url}#toolbar=0&view=FitH`}
                  title={current.name}
                  className="size-full rounded-xl bg-white"
                />
              )}
            </div>
            {many ? (
              <div className="flex justify-center gap-1.5" aria-hidden>
                {items.map((a, i) => (
                  <span
                    key={a.id}
                    className={cn(
                      "size-2 rounded-full",
                      i === index ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
