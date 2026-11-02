import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { common, roomGalleryCopy as copy } from "@/content/copy";
import { shrinkPhoto } from "@/lib/photo-file";
import {
  MAX_PHOTOS_PER_ROOM,
  SPACES,
  SPACE_LABELS,
  aiPhotoAccess,
  type RoomPhoto,
  type Space,
} from "@/lib/room-photos";
import {
  addRoomPhotos,
  listRoomPhotos,
  orderRoomPhotos,
  removeRoomPhoto,
  sortRoomPhotosAI,
  updateRoomPhoto,
} from "@/lib/room-photos.functions";
import { cn } from "@/lib/utils";

const SHARED = "shared";

/**
 * Direct stays → the photos guests flick through on the booking page: per
 * room, plus the property's shared spaces, each photo with its space and an
 * optional caption, in the host's order. AI can sort a room's photos by
 * space (plan feature, or a two-room trial).
 */
export function RoomGallery({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(listRoomPhotos);
  const addFn = useServerFn(addRoomPhotos);
  const updateFn = useServerFn(updateRoomPhoto);
  const orderFn = useServerFn(orderRoomPhotos);
  const removeFn = useServerFn(removeRoomPhoto);
  const sortFn = useServerFn(sortRoomPhotosAI);
  const key = ["room-photos", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => fn({ data: { propertyId } }) });
  const [picked, setPicked] = useState<string | null>(null);
  const [space, setSpace] = useState<Space>("bedroom");
  const [busy, setBusy] = useState<"upload" | "ai" | null>(null);
  const file = useRef<HTMLInputElement>(null);

  if (q.isLoading) return <Skeleton className="h-48 rounded-2xl" />;
  const d = q.data;
  if (!d) return null;
  const current = picked ?? d.rooms[0]?.id ?? SHARED;
  const roomId = current === SHARED ? null : current;
  const photos = d.photos
    .filter((p) => p.roomId === roomId)
    .sort((a, b) => a.position - b.position);
  const access = aiPhotoAccess({
    hasFeature: d.ai.hasFeature,
    triedRooms: d.ai.tried,
    roomKey: roomId ?? propertyId,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, MAX_PHOTOS_PER_ROOM - photos.length);
    if (!list.length) return void toast.error(copy.full(MAX_PHOTOS_PER_ROOM));
    setBusy("upload");
    try {
      for (let i = 0; i < list.length; i += 3) {
        const batch = await Promise.all(list.slice(i, i + 3).map((f) => shrinkPhoto(f)));
        await addFn({ data: { propertyId, roomId, space, photos: batch } });
      }
      await refresh();
      toast.success(copy.added(list.length));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  }

  async function run(f: () => Promise<unknown>) {
    try {
      await f();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    }
  }

  const move = (p: RoomPhoto, by: number) => {
    const ids = photos.map((x) => x.id);
    const i = ids.indexOf(p.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void run(() => orderFn({ data: { ids } }));
  };

  async function sortWithAi() {
    setBusy("ai");
    try {
      const r = await sortFn({ data: { propertyId, roomId } });
      await refresh();
      toast.success(copy.aiDone(r.sorted));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5" data-tour="direct-photos">
      <div>
        <h2 className="text-lg">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
      </div>
      {!d.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {[
          ...d.rooms.map((r) => ({ id: r.id, name: r.name })),
          { id: SHARED, name: copy.shared },
        ].map((r) => {
          const n = d.photos.filter((p) => p.roomId === (r.id === SHARED ? null : r.id)).length;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setPicked(r.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                current === r.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-secondary",
              )}
            >
              {r.name} <span className="opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={space} onValueChange={(v) => setSpace(v as Space)}>
          <SelectTrigger className="h-10 w-48" aria-label={copy.newSpace}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPACES.map((s) => (
              <SelectItem key={s} value={s}>
                {SPACE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!d.available || busy !== null}
          onClick={() => file.current?.click()}
        >
          {busy === "upload" ? <Loader2 className="animate-spin" /> : <ImagePlus />} {copy.add}
        </Button>
        {d.ai.on ? (
          <Button
            type="button"
            variant="outline"
            disabled={!photos.length || !access.allowed || busy !== null}
            onClick={() => void sortWithAi()}
          >
            {busy === "ai" ? <Loader2 className="animate-spin" /> : <Sparkles />} {copy.ai}
          </Button>
        ) : null}
      </div>
      {d.ai.on && access.trial ? (
        <p className="text-xs text-muted-foreground">
          {access.allowed ? copy.trialLeft(access.trialLeft, d.ai.trialRooms) : copy.trialUsed}
        </p>
      ) : null}

      {photos.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{copy.none}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.id} className="space-y-2 rounded-xl border border-border p-2">
              <img
                src={p.url}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full rounded-lg object-cover"
              />
              <Select
                value={p.space}
                onValueChange={(v) =>
                  void run(() => updateFn({ data: { id: p.id, space: v as Space } }))
                }
              >
                <SelectTrigger className="h-9" aria-label={copy.space}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPACES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SPACE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-9"
                placeholder={copy.caption}
                aria-label={copy.caption}
                defaultValue={p.caption ?? ""}
                maxLength={140}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (p.caption ?? ""))
                    void run(() => updateFn({ data: { id: p.id, caption: v || null } }));
                }}
              />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => move(p, -1)}
                  aria-label={copy.earlier}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={i === photos.length - 1}
                  onClick={() => move(p, 1)}
                  aria-label={copy.later}
                >
                  <ArrowDown />
                </Button>
                <span className="flex-1" />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => void run(() => removeFn({ data: { id: p.id } }))}
                  aria-label={copy.remove}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
