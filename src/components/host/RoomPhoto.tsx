import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { common, roomPhotoCopy as copy } from "@/content/copy";
import { saveRoomPhoto } from "@/lib/guide-tiles.functions";
import { coverFor } from "@/lib/theme-covers";
import { normaliseTheme } from "@/lib/theme";

/** Resizes to at most 1600px so uploads stay small on phone connections. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("That photo couldn't be read."));
    img.src = URL.createObjectURL(file);
  });
}

/** One room's guide cover: its own photo, or the property's cover (or the template's) until there is one. */
export function RoomPhoto({
  propertyId,
  roomId,
  photo,
  themeConfig,
}: {
  propertyId: string;
  roomId: string;
  photo: string | null;
  themeConfig: unknown;
}) {
  const save = useServerFn(saveRoomPhoto);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const fallback = coverFor(normaliseTheme(themeConfig));
  const shown = photo || fallback;

  async function run(dataUrl: string | null) {
    setBusy(true);
    try {
      await save({ data: { roomId, dataUrl } });
      await qc.invalidateQueries({ queryKey: ["guide-tiles", propertyId] });
      toast.success(dataUrl ? copy.saved : copy.removed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      {shown ? (
        <img
          src={shown}
          alt=""
          className="aspect-[16/10] w-full rounded-2xl object-cover sm:w-48"
        />
      ) : (
        <div className="aspect-[16/10] w-full rounded-2xl bg-primary/10 sm:w-48" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="text-lg">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-secondary">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}{" "}
            {photo ? copy.replace : copy.upload}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  await run(await shrink(f));
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : common.errorBody);
                }
              }}
            />
          </label>
          {photo ? (
            <Button variant="ghost" onClick={() => void run(null)} disabled={busy}>
              {copy.remove}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
