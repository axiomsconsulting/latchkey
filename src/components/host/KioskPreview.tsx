import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, MonitorSmartphone } from "lucide-react";

import { KioskGoodbyeScreen } from "@/components/guest/KioskGoodbye";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { kioskPreviewCopy as copy } from "@/content/copy";
import { PER_PAGE } from "@/lib/checkout-goodbye";
import { previewKioskScreens } from "@/lib/goodbye.functions";
import { tabletName } from "@/lib/kiosk-devices";

/** One tablet screen, drawn at the tablet's own size and scaled down to fit. */
function Frame({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / w);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden rounded-xl border-4 border-neutral-800 bg-neutral-800 shadow"
      style={{ aspectRatio: `${w} / ${h}` }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: w, height: h, transform: `scale(${scale})` }}
      >
        <div className="relative h-full w-full">{children}</div>
      </div>
    </div>
  );
}

/**
 * What every door tablet at this property shows now, screen by screen: its
 * check-in and check-out cards (the host's own welcome merged in) on each
 * page they turn through, the full-screen welcome when there are no cards,
 * or the usual start screen. Refreshes every 15 seconds while open.
 */
export function KioskPreview({ property }: { property: { id: string; short_code: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Eye className="size-4" /> {copy.open}
      </Button>
      {open ? <PreviewDialog property={property} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PreviewDialog({
  property,
  onClose,
}: {
  property: { id: string; short_code: string };
  onClose: () => void;
}) {
  const fn = useServerFn(previewKioskScreens);
  const q = useQuery({
    queryKey: ["kiosk-preview", property.id],
    queryFn: () => fn({ data: { propertyId: property.id } }),
    refetchInterval: 15_000,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94dvh] w-[min(96vw,72rem)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {!q.data ? (
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-8">
            {q.data.tablets.map((t) => {
              const cards = t.cards.cards;
              const pages = Math.max(1, Math.ceil(cards.length / PER_PAGE));
              return (
                <section key={t.id ?? "all"} className="space-y-3">
                  <h3 className="flex items-center gap-2 font-medium">
                    <MonitorSmartphone className="size-4" />
                    {t.id ? `${t.number}. ${tabletName(t)}` : copy.allTablets}
                    <span className="text-xs font-normal text-muted-foreground">
                      {cards.length
                        ? copy.cardsLine(cards.length, pages)
                        : t.welcome
                          ? copy.welcomeLine
                          : copy.startLine}
                    </span>
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {cards.length ? (
                      Array.from({ length: pages }, (_, page) => (
                        <figure key={page} className="space-y-1">
                          <Frame w={t.w} h={t.h}>
                            <KioskGoodbyeScreen
                              code={property.short_code}
                              goodbyes={t.cards}
                              contained
                              page={page}
                              onCheckIn={() => {}}
                              onArrive={() => {}}
                              onLeft={() => {}}
                            />
                          </Frame>
                          {pages > 1 ? (
                            <figcaption className="text-xs text-muted-foreground">
                              {copy.screenOf(page + 1, pages)}
                            </figcaption>
                          ) : null}
                        </figure>
                      ))
                    ) : t.welcome ? (
                      <Frame w={t.w} h={t.h}>
                        <div className="flex h-full flex-col items-center justify-center bg-primary p-16 text-center text-primary-foreground">
                          <p className="font-display text-7xl font-bold leading-tight">
                            {t.welcome.headline}
                          </p>
                          {t.welcome.body ? (
                            <p className="mt-6 text-3xl">{t.welcome.body}</p>
                          ) : null}
                          <p className="mt-12 rounded-full bg-primary-foreground px-10 py-4 text-3xl font-bold text-primary">
                            {copy.checkIn}
                          </p>
                        </div>
                      </Frame>
                    ) : (
                      <Frame w={t.w} h={t.h}>
                        <div className="flex h-full flex-col items-center justify-center bg-background p-16 text-center">
                          <p className="font-display text-6xl">{copy.startTitle}</p>
                          <p className="mt-6 text-2xl text-muted-foreground">{copy.startBody}</p>
                        </div>
                      </Frame>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
