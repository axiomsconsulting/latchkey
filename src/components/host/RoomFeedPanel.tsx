import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { feedCopy as copy } from "@/content/copy";
import { getRoomFeed, setRoomFeed } from "@/lib/feed.functions";

/** Lets the host share this room's direct bookings as a calendar link. */
export function RoomFeedPanel({ roomId, roomName }: { roomId: string; roomName: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getRoomFeed);
  const set = useServerFn(setRoomFeed);
  const q = useQuery({ queryKey: ["room-feed", roomId], queryFn: () => get({ data: { roomId } }) });

  const url =
    q.data?.enabled && q.data.token && typeof window !== "undefined"
      ? `${window.location.origin}/api/public/calendar/${q.data.token}.ics`
      : null;

  async function save(enabled: boolean, regenerate = false) {
    try {
      await set({ data: { roomId, enabled, regenerate } });
      await qc.invalidateQueries({ queryKey: ["room-feed", roomId] });
      if (regenerate) toast.success(copy.regenerated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  return (
    <div className="mt-3 w-full rounded-2xl border border-border bg-secondary/30 p-3">
      <label className="flex items-center gap-3 text-sm">
        <Switch
          checked={q.data?.enabled ?? false}
          onCheckedChange={(v) => save(v)}
          aria-label={`${copy.enable}: ${roomName}`}
        />
        {copy.enable}
      </label>
      <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
      {url ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">{copy.detail}</p>
          <code className="block truncate rounded-xl bg-surface px-3 py-2 text-xs">{url}</code>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                toast.success(copy.copied);
              }}
            >
              {copy.copy}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => save(true, true)}>
              {copy.regenerate}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
