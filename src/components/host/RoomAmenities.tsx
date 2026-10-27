import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SaveButton } from "@/components/host/SaveButton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { common, guideCopy as copy } from "@/content/copy";
import { saveRoomAmenities } from "@/lib/guide.functions";

/** What's already in the room, shown to guests above the extras list. */
export function RoomAmenities({
  propertyId,
  roomId,
  amenities,
}: {
  propertyId: string;
  roomId: string;
  amenities: string[];
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveRoomAmenities);
  const [text, setText] = useState(amenities.join("\n"));
  const [saved, setSaved] = useState(text);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setText(amenities.join("\n"));
    setSaved(amenities.join("\n"));
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setBusy(true);
    try {
      const list = text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30);
      await save({ data: { roomId, amenities: list } });
      await qc.invalidateQueries({ queryKey: ["guide", propertyId] });
      setSaved(text);
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="amenities">{copy.amenitiesLabel}</Label>
          <p className="text-sm text-muted-foreground">{copy.amenitiesHelp}</p>
        </div>
        <SaveButton
          dirty={text.trim() !== saved.trim()}
          busy={busy}
          label={copy.save}
          onClick={() => void submit()}
        />
      </div>
      <Textarea id="amenities" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
    </section>
  );
}
