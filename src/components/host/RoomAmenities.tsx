import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { common, guideCopy as copy } from "@/content/copy";
import { saveRoomAmenities } from "@/lib/guide.functions";

/** What's already in the room, shown to guests above the extras list. */
export function RoomAmenities({ propertyId, roomId, amenities }: { propertyId: string; roomId: string; amenities: string[] }) {
  const qc = useQueryClient();
  const save = useServerFn(saveRoomAmenities);
  const [text, setText] = useState(amenities.join("\n"));
  const [busy, setBusy] = useState(false);

  useEffect(() => setText(amenities.join("\n")), [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setBusy(true);
    try {
      const list = text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30);
      await save({ data: { roomId, amenities: list } });
      await qc.invalidateQueries({ queryKey: ["guide", propertyId] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-2 p-4">
      <Label htmlFor="amenities">{copy.amenitiesLabel}</Label>
      <p className="text-sm text-muted-foreground">{copy.amenitiesHelp}</p>
      <Textarea id="amenities" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="button" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {copy.save}
      </Button>
    </section>
  );
}
