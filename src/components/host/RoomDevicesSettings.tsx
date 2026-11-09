import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Loader2, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { common, roomLightsCopy as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import {
  disconnectSmartThings,
  findSmartDevices,
  getRoomDevices,
  hostDeviceControl,
  linkRoomDevice,
  smartThingsConnectUrl,
  updateRoomDevice,
} from "@/lib/room-devices.functions";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : common.errorBody);

/** Settings → Alerts and apps → Room lights: connect SmartThings, link lights to rooms, try them. */
export function RoomDevicesSettings({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getRoomDevices);
  const connectFn = useServerFn(smartThingsConnectUrl);
  const disconnectFn = useServerFn(disconnectSmartThings);
  const updateFn = useServerFn(updateRoomDevice);
  const controlFn = useServerFn(hostDeviceControl);
  const key = ["room-devices", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => fetchFn({ data: { propertyId } }) });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Back from SmartThings: say how it went, once.
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("smartthings");
    if (!result) return;
    const words = copy.results[result];
    if (words) (result === "connected" ? toast.success : toast.error)(words);
    url.searchParams.delete("smartthings");
    window.history.replaceState(null, "", url.toString());
  }, []);

  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function connect() {
    if (!d) return;
    setBusy("connect");
    try {
      const { url } = await connectFn({ data: { hostId: d.hostId } });
      window.location.href = url;
    } catch (e) {
      err(e);
      setBusy(null);
    }
  }

  async function run(id: string, f: () => Promise<unknown>) {
    setBusy(id);
    try {
      await f();
      await refresh();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  }

  const live = d?.mode === "live";
  const canLink = !!d && d.canWrite && (!live || !!d.link);
  const roomName = new Map((d?.rooms ?? []).map((r) => [r.id, r.name]));

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg">
            <Lightbulb className="size-5 text-primary" /> {copy.hostTitle}
            <InfoTip label={copy.hostTitle}>{copy.hostIntro}</InfoTip>
          </h2>
          <p className="text-sm text-muted-foreground">{copy.intro}</p>
        </div>
        {canLink ? (
          <Button size="sm" onClick={() => setAdding(true)} disabled={!d?.ready}>
            <Plus className="size-4" aria-hidden /> {copy.addDevice}
          </Button>
        ) : null}
      </div>

      {!d ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : !d.ready ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.migration}</p>
      ) : (
        <>
          {!d.canWrite ? <p className="text-sm text-muted-foreground">{copy.readOnly}</p> : null}
          {!live ? (
            <p className="rounded-xl bg-muted p-3 text-sm">{copy.demoNote}</p>
          ) : !d.configured ? (
            <p className="rounded-xl bg-muted p-3 text-sm">{copy.notConfigured}</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
              <p className="min-w-0">
                {d.link
                  ? d.link.lastError
                    ? copy.signedOut
                    : copy.connected(formatUkDate(d.link.connectedAt.slice(0, 10)))
                  : copy.notConnected}
              </p>
              {d.canWrite ? (
                <div className="flex gap-2" data-keep-size>
                  <Button size="sm" onClick={() => void connect()} disabled={busy === "connect"}>
                    {d.link ? copy.reconnect : copy.connect}
                  </Button>
                  {d.link ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void run("disconnect", () => disconnectFn({ data: { hostId: d.hostId } }))
                      }
                    >
                      {copy.disconnect}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {d.devices.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {d.devices.map((dev) => (
                <li key={dev.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{dev.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {roomName.get(dev.roomId) ?? ""}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={dev.guestOn}
                      disabled={!d.canWrite}
                      onCheckedChange={(v) =>
                        void run(dev.id, () => updateFn({ data: { id: dev.id, guestOn: v } }))
                      }
                    />
                    {copy.guestsUse}
                  </label>
                  {d.canWrite ? (
                    <div className="flex gap-2" data-keep-size>
                      <TryIt id={dev.id} control={controlFn} />
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={copy.remove}
                        onClick={() =>
                          void run(dev.id, () => updateFn({ data: { id: dev.id, remove: true } }))
                        }
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{copy.none}</p>
          )}
        </>
      )}

      {d && adding ? (
        <AddDevice
          hostId={d.hostId}
          rooms={d.rooms}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}

/** Switches the light on or off from the dashboard, showing what it's doing now. */
function TryIt({
  id,
  control,
}: {
  id: string;
  control: ReturnType<typeof useServerFn<typeof hostDeviceControl>>;
}) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  async function tap() {
    setBusy(true);
    try {
      const now = on === null ? (await control({ data: { id } })).state.on : on;
      const r = await control({ data: { id, command: { power: !now } } });
      setOn(r.state.on);
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void tap()} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
      {on === null ? copy.tryIt : on ? copy.turnOff : copy.turnOn}
    </Button>
  );
}

function AddDevice({
  hostId,
  rooms,
  onClose,
  onAdded,
}: {
  hostId: string;
  rooms: Array<{ id: string; name: string }>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const findFn = useServerFn(findSmartDevices);
  const linkFn = useServerFn(linkRoomDevice);
  const found = useQuery({
    queryKey: ["smart-devices", hostId],
    queryFn: () => findFn({ data: { hostId } }),
    retry: false,
  });
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      await linkFn({ data: { roomId, deviceId } });
      onAdded();
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }
  const devices = found.data?.devices ?? [];
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.addDevice}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{copy.chooseRoom}</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{copy.chooseDevice}</Label>
            {found.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : found.error ? (
              <p className="text-sm text-destructive">
                {found.error instanceof Error ? found.error.message : common.errorBody}
              </p>
            ) : devices.length ? (
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder={copy.chooseDevice} />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((dv) => (
                    <SelectItem key={dv.deviceId} value={dv.deviceId}>
                      {dv.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">{copy.noDevices}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common.cancel}
          </Button>
          <Button onClick={() => void add()} disabled={!roomId || !deviceId || busy}>
            {copy.addDevice}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
