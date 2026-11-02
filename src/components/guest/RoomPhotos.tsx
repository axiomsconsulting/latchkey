import { useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, ChevronLeft, ChevronRight, Images } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { roomPhotosCopy as copy } from "@/content/copy";
import { roomGallery, type RoomPhoto } from "@/lib/room-photos";
import { cn } from "@/lib/utils";

/**
 * A room's picture on the booking page: the first photo with a count, and
 * a tap opens every photo of the room and the shared spaces, grouped by
 * space (chips jump to a space), one at a time with arrows, swipe or keys.
 */
export function RoomPhotos({
  roomId,
  name,
  cover,
  photos,
}: {
  roomId: string;
  name: string;
  cover: string | null;
  photos: RoomPhoto[];
}) {
  const gallery = useMemo(() => roomGallery(roomId, photos, cover), [roomId, photos, cover]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const all = gallery.all;
  const first = all[0];

  if (!first)
    return (
      <div className="grid aspect-[16/9] w-full place-items-center bg-primary/10 text-primary">
        <BedDouble className="size-10" />
      </div>
    );

  return (
    <>
      <button
        type="button"
        className="group relative block w-full overflow-hidden"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        aria-label={copy.open(name, all.length)}
      >
        <img
          src={first.url}
          alt=""
          loading="lazy"
          className="aspect-[16/9] w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
        {all.length > 1 ? (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white">
            <Images className="size-3.5" aria-hidden /> {copy.count(all.length)}
          </span>
        ) : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] max-w-5xl grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 p-3 sm:h-[90dvh] sm:p-5">
          <DialogTitle className="pr-8 text-lg">{name}</DialogTitle>
          <DialogDescription className="sr-only">{copy.help}</DialogDescription>
          <Viewer all={all} groups={gallery.groups} index={index} onIndex={setIndex} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Viewer({
  all,
  groups,
  index,
  onIndex,
}: {
  all: RoomPhoto[];
  groups: ReturnType<typeof roomGallery>["groups"];
  index: number;
  onIndex: (i: number) => void;
}) {
  const photo = all[index]!;
  const go = (d: number) => onIndex((index + d + all.length) % all.length);
  const startX = useRef<number | null>(null);
  const chips = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  // Keep the current space's chip in view.
  useEffect(() => {
    chips.current
      ?.querySelector<HTMLElement>("[data-current=true]")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [photo.space]);

  return (
    <>
      <div ref={chips} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {groups.map((g) => {
          const start = all.indexOf(g.photos[0]!);
          const current = g.space === photo.space;
          return (
            <button
              key={g.space}
              type="button"
              data-current={current}
              onClick={() => onIndex(start)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card",
              )}
            >
              {g.label} <span className="opacity-70">{g.photos.length}</span>
            </button>
          );
        })}
      </div>
      <div
        className="relative grid min-h-0 place-items-center overflow-hidden rounded-2xl bg-black/90"
        onPointerDown={(e) => {
          startX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
        style={{ touchAction: "pan-y" }}
      >
        <img
          key={photo.id}
          src={photo.url}
          alt={photo.caption ?? photo.space}
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
        />
        {all.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={copy.previous}
              className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={copy.next}
              className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        ) : null}
      </div>
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0">
          <span className="font-medium">{groups.find((g) => g.space === photo.space)?.label}</span>
          {photo.caption ? <span className="text-muted-foreground"> · {photo.caption}</span> : null}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {index + 1} / {all.length}
        </span>
      </p>
    </>
  );
}
