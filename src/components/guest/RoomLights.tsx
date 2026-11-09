import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Moon, Power, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { roomLightsCopy as copy } from "@/content/copy";
import { controlStayDevice, getStayDevices } from "@/lib/room-devices.functions";
import {
  WARMTH,
  applyCommand,
  glowOf,
  presetsFor,
  type Command,
  type Control,
  type DeviceState,
} from "@/lib/room-devices";
import { cn } from "@/lib/utils";

type Device = {
  id: string;
  label: string;
  controls: Control[];
  light: boolean;
  state: DeviceState;
};

/**
 * The guest's own room lights on their stay guide, from check-in until
 * check-out (deviceAccess on the server decides; this only shows it).
 */
export function RoomLights({ token, timeZone }: { token: string; timeZone: string }) {
  const fetchFn = useServerFn(getStayDevices);
  const q = useQuery({
    queryKey: ["stay-devices", token],
    queryFn: () => fetchFn({ data: { token } }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const access = q.data?.access;
  if (!access) return null;
  if (!access.ok) {
    if (access.reason !== "not_yet" && access.reason !== "taken") return null;
    const when =
      access.reason === "not_yet" && access.from
        ? new Intl.DateTimeFormat("en-GB", {
            timeZone,
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(access.from))
        : "";
    return (
      <section id="stay-lights" className="card-soft flex scroll-mt-6 items-center gap-3 p-5">
        <Lightbulb className="size-6 shrink-0 text-accent" aria-hidden />
        <p className="text-lg">{access.reason === "not_yet" ? copy.notYet(when) : copy.taken}</p>
      </section>
    );
  }
  return (
    <section
      id="stay-lights"
      aria-labelledby="stay-lights-title"
      className="card-soft scroll-mt-6 p-5"
    >
      <h2 id="stay-lights-title" className="text-xl">
        {copy.title}
      </h2>
      <p className="mt-1 text-muted-foreground">{copy.intro}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(q.data?.devices ?? []).map((d) => (
          <LightCard key={d.id} token={token} device={d as Device} />
        ))}
      </div>
    </section>
  );
}

function LightCard({ token, device }: { token: string; device: Device }) {
  const send = useServerFn(controlStayDevice);
  const [state, setState] = useState<DeviceState>(device.state);
  const busy = useRef(0);
  // Take the server's reading unless the guest has just tapped.
  useEffect(() => {
    if (busy.current === 0) setState(device.state);
  }, [device.state]);
  const presets = presetsFor(device.controls);
  const has = (c: Control) => device.controls.includes(c);

  async function act(command: Command) {
    const before = state;
    const next = applyCommand(state, command);
    setState(next);
    busy.current++;
    try {
      const r = await send({ data: { token, id: device.id, command, state: before } });
      setState(r.state);
    } catch (e) {
      setState(before);
      toast.error(e instanceof Error ? e.message : copy.failed);
    } finally {
      busy.current--;
    }
  }

  const glow = glowOf(state);
  return (
    <article className="rounded-3xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-full border border-border"
          style={state.on ? { background: glow, boxShadow: `0 0 24px ${glow}` } : undefined}
          aria-hidden
        >
          <Lightbulb
            className={cn("size-6", state.on ? "text-black/70" : "text-muted-foreground")}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium">{device.label}</p>
          <p className="text-sm text-muted-foreground">
            {state.on === null ? "" : state.on ? copy.on : copy.off}
            {state.on && state.level !== null && has("brightness") ? ` · ${state.level}%` : ""}
          </p>
        </div>
        <Button
          size="lg"
          variant={state.on ? "default" : "outline"}
          className="min-h-12 shrink-0"
          aria-pressed={!!state.on}
          onClick={() => act({ power: !state.on })}
        >
          <Power className="size-5" aria-hidden />
          {state.on ? copy.turnOff : copy.turnOn}
        </Button>
      </div>

      {!state.online && state.on === null ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <WifiOff className="size-4" aria-hidden />
          {copy.offline}
        </p>
      ) : null}

      {has("brightness") ? (
        <Range
          label={copy.brightness}
          min={1}
          max={100}
          value={state.level ?? 50}
          onCommit={(level) => act({ level })}
          className="lk-range-level"
        />
      ) : null}
      {has("warmth") ? (
        <Range
          label={copy.warmth}
          min={WARMTH.min}
          max={WARMTH.max}
          step={100}
          value={state.kelvin ?? 2700}
          ends={[copy.warm, copy.cool]}
          onCommit={(kelvin) => act({ kelvin })}
          className="lk-range-warmth"
        />
      ) : null}

      {presets.length ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">{copy.colours}</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => act(p.command)}
                className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-base"
              >
                <span
                  className="size-4 rounded-full border border-black/10"
                  style={{ background: p.swatch }}
                  aria-hidden
                />
                {copy.presets[p.key]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => act({ power: false })}
              className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-base"
            >
              <Moon className="size-4" aria-hidden />
              {copy.goodnight}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/** A finger-sized slider that sends once, when let go. */
function Range({
  label,
  min,
  max,
  step = 1,
  value,
  ends,
  onCommit,
  className,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  ends?: [string, string];
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [v, setV] = useState(value);
  const held = useRef(false);
  useEffect(() => {
    if (!held.current) setV(value);
  }, [value]);
  const commit = () => {
    held.current = false;
    if (v !== value) onCommit(v);
  };
  return (
    <label className="mt-4 block">
      <span className="flex justify-between text-sm font-medium">
        <span>{label}</span>
        {ends ? (
          <span className="text-muted-foreground">
            {ends[0]} · {ends[1]}
          </span>
        ) : (
          <span className="text-muted-foreground">{v}%</span>
        )}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onPointerDown={() => (held.current = true)}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={() => (held.current ? commit() : undefined)}
        className={cn("lk-range mt-2", className)}
      />
    </label>
  );
}
