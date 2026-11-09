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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { suggestRoom } from "@/lib/room-devices";
import {
  connectTapoAccount,
  disconnectSmartThings,
  findSmartDevices,
  getRoomDevices,
  hostDeviceControl,
  linkRoomDevice,
  smartThingsConnectUrl,
  updateRoomDevice,
} from "@/lib/room-devices.functions";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : common.errorBody);

/**
 * Settings → Alerts and apps → Room lights: sign in to the lights' account
 * without leaving Latchkey (TP-Link Tapo in a dialog, or SmartThings in a
 * popup), then add each light, its room already picked from its name.
 */
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
  const [tapo, setTapo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  // Back from SmartThings: in the popup's message, or (popup blocked) in the address.
  useEffect(() => {
    const said = (result: string) => {
      const words = copy.results[result];
      if (words) (result === "connected" ? toast.success : toast.error)(words);
      void qc.invalidateQueries({ queryKey: ["room-devices"] });
      if (result === "connected") setAdding(true);
    };
    const url = new URL(window.location.href);
    const result = url.searchParams.get("smartthings");
    if (result) {
      said(result);
      url.searchParams.delete("smartthings");
      window.history.replaceState(null, "", url.toString());
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const r = (e.data as { latchkeySmartThings?: unknown } | null)?.latchkeySmartThings;
      if (typeof r === "string") said(r);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [qc]);

  const d = q.data;

  async function connect() {
    if (!d) return;
    if (d.provider === "tapo") return setTapo(true);
    // Opened straight away (in the tap) so browsers allow it; pointed at SmartThings once the link is ready.
    const popup = window.open("", "lk-smartthings", "popup,width=520,height=760");
    setBusy("connect");
    try {
      const { url } = await connectFn({ data: { hostId: d.hostId } });
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (e) {
      popup?.close();
      err(e);
    } finally {
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
  const service = d?.link?.provider ?? d?.provider ?? "smartthings";
  const name = copy.services[service] ?? "";
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
          ) : d.provider === "smartthings" && !d.configured && !d.link ? (
            <p className="rounded-xl bg-muted p-3 text-sm">{copy.notConfigured}</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
              <p className="min-w-0">
                {d.link
                  ? d.link.lastError
                    ? copy.signedOut(name)
                    : copy.connected(
                        name,
                        d.link.account ?? "",
                        formatUkDate(d.link.connectedAt.slice(0, 10)),
                      )
                  : copy.notConnected(copy.services[d.provider] ?? "")}
              </p>
              {d.canWrite ? (
                <div className="flex gap-2" data-keep-size>
                  <Button size="sm" onClick={() => void connect()} disabled={busy === "connect"}>
                    {busy === "connect" ? <Loader2 className="size-4 animate-spin" /> : null}
                    {d.link ? copy.reconnect : copy.connect(copy.services[d.provider] ?? "")}
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

      {d && tapo ? (
        <TapoSignIn
          hostId={d.hostId}
          onClose={() => setTapo(false)}
          onDone={() => {
            setTapo(false);
            void refresh();
            setAdding(true);
          }}
        />
      ) : null}
      {d && adding ? (
        <AddDevices
          hostId={d.hostId}
          rooms={d.rooms}
          linked={new Set(d.devices.map((x) => `${x.roomId}:${x.label}`))}
          onClose={() => {
            setAdding(false);
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}

/** TP-Link sign-in, inside Latchkey. */
function TapoSignIn({
  hostId,
  onClose,
  onDone,
}: {
  hostId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const connectFn = useServerFn(connectTapoAccount);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await connectFn({ data: { hostId, email, password } });
      toast.success(copy.tapoConnected(r.devices));
      onDone();
    } catch (x) {
      err(x);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <form onSubmit={(e) => void go(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{copy.tapoTitle}</DialogTitle>
            <DialogDescription>{copy.tapoBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="tapo-email">{copy.tapoEmail}</Label>
            <Input
              id="tapo-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tapo-password">{copy.tapoPassword}</Label>
            <Input
              id="tapo-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <p className="text-sm text-muted-foreground">{copy.tapoTip}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {common.cancel}
            </Button>
            <Button type="submit" disabled={busy || !email || !password}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {copy.tapoSignIn}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

/** Every device in the account, each with its room picked from its name; one tap adds it. */
function AddDevices({
  hostId,
  rooms,
  linked,
  onClose,
}: {
  hostId: string;
  rooms: Array<{ id: string; name: string }>;
  linked: Set<string>;
  onClose: () => void;
}) {
  const findFn = useServerFn(findSmartDevices);
  const found = useQuery({
    queryKey: ["smart-devices", hostId],
    queryFn: () => findFn({ data: { hostId } }),
    retry: false,
  });
  const devices = found.data?.devices ?? [];
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.addDevice}</DialogTitle>
          <DialogDescription>{copy.addBody}</DialogDescription>
        </DialogHeader>
        {found.isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : found.error ? (
          <p className="text-sm text-destructive">
            {found.error instanceof Error ? found.error.message : common.errorBody}
          </p>
        ) : devices.length ? (
          <ul className="space-y-3">
            {devices.map((dv) => (
              <DeviceRow key={dv.deviceId} device={dv} rooms={rooms} linked={linked} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.noDevices}</p>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{copy.done}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeviceRow({
  device,
  rooms,
  linked,
}: {
  device: { deviceId: string; label: string; model: string | null };
  rooms: Array<{ id: string; name: string }>;
  linked: Set<string>;
}) {
  const linkFn = useServerFn(linkRoomDevice);
  const [roomId, setRoomId] = useState(suggestRoom(device.label, rooms)?.id ?? "");
  const [state, setState] = useState<"idle" | "busy" | "added">(
    rooms.some((r) => linked.has(`${r.id}:${device.label}`)) ? "added" : "idle",
  );
  async function add() {
    setState("busy");
    try {
      await linkFn({ data: { roomId, deviceId: device.deviceId } });
      setState("added");
    } catch (e) {
      err(e);
      setState("idle");
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-medium">{device.label}</p>
        {device.model ? <p className="text-xs text-muted-foreground">{device.model}</p> : null}
      </div>
      <Select value={roomId} onValueChange={setRoomId} disabled={state !== "idle"}>
        <SelectTrigger className="w-40" aria-label={copy.chooseRoom}>
          <SelectValue placeholder={copy.chooseRoom} />
        </SelectTrigger>
        <SelectContent>
          {rooms.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={() => void add()} disabled={!roomId || state !== "idle"}>
        {state === "busy" ? <Loader2 className="size-4 animate-spin" /> : null}
        {state === "added" ? copy.added : copy.add}
      </Button>
    </li>
  );
}
