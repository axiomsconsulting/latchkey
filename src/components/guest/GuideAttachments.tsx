import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { guest as copy } from "@/content/copy";

export type Attachment = { id: string; name: string; kind: "image" | "pdf" | "doc"; url: string };

/**
 * A section's photos and documents for guests: photos as thumbnails,
 * documents as tiles; any of them opens in a viewer inside the app (photos
 * full size, documents as pages), never a download or another site.
 */
export function GuideAttachments({ items }: { items: Attachment[] | undefined }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items?.length) return null;
  const current = open === null ? null : items[open];
  return (
    <>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group flex w-28 flex-col overflow-hidden rounded-xl border border-border bg-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={copy.attachmentOpen(a.name)}
            >
              {a.kind === "image" ? (
                <img src={a.url} alt="" loading="lazy" className="aspect-[4/3] w-full bg-muted object-cover transition-transform group-hover:scale-105" />
              ) : (
                <span className="grid aspect-[4/3] w-full place-items-center bg-secondary text-primary">
                  <FileText className="size-8" />
                </span>
              )}
              <span className="truncate px-2 py-1.5 text-xs">{a.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={current !== null && current !== undefined} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="flex h-[92dvh] max-w-4xl flex-col gap-3 p-3 sm:p-4 [&>button]:hidden">
          {current ? (
            <>
              <div className="flex items-center gap-2">
                <DialogTitle className="min-w-0 flex-1 truncate text-base font-medium">{current.name}</DialogTitle>
                {items.length > 1 ? (
                  <>
                    <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-muted" aria-label={copy.attachmentPrev} onClick={() => setOpen((i) => ((i ?? 0) + items.length - 1) % items.length)}>
                      <ChevronLeft className="size-5" />
                    </button>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {(open ?? 0) + 1}/{items.length}
                    </span>
                    <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-muted" aria-label={copy.attachmentNext} onClick={() => setOpen((i) => ((i ?? 0) + 1) % items.length)}>
                      <ChevronRight className="size-5" />
                    </button>
                  </>
                ) : null}
                <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-muted" aria-label={copy.attachmentClose} onClick={() => setOpen(null)}>
                  <X className="size-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-muted">
                {current.kind === "image" ? (
                  <img src={current.url} alt={current.name} className="mx-auto h-full w-auto max-w-full object-contain" />
                ) : (
                  // Documents are shown as PDF pages, inside the app.
                  <iframe src={`${current.url}#toolbar=0&view=FitH`} title={current.name} className="size-full rounded-xl bg-white" />
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
