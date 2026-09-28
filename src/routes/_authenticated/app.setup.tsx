import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/host/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { common, onboarding as copy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import { loadDemoData, saveProperty, saveRoom } from "@/lib/host.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/setup")({
  head: () => ({
    meta: [
      { title: "Set up your rooms · Latchkey" },
      {
        name: "description",
        content: "Three short steps to add your property, rooms and arrival times.",
      },
    ],
  }),
  component: SetupPage,
});

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "rooms"
  );
}

function SetupPage() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const saveProp = useServerFn(saveProperty);
  const addRoom = useServerFn(saveRoom);
  const demo = useServerFn(loadDemoData);
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [property, setProperty] = useState({
    name: "",
    address: "",
    postcode: "",
    short_code: "",
  });
  const [rooms, setRooms] = useState<string[]>(["", "", ""]);
  const [times, setTimes] = useState({
    check_in: "15:00",
    check_out: "11:00",
    quiet_start: "22:00",
    quiet_end: "07:00",
    pin: "",
  });

  const steps = [copy.step1, copy.step2, copy.step3];

  async function finish() {
    if (!workspace.data) return;
    setBusy(true);
    try {
      const created = await saveProp({
        data: {
          hostId: workspace.data.hostId,
          name: property.name.trim(),
          address: property.address.trim() || null,
          postcode: property.postcode.trim() || null,
          short_code: (property.short_code.trim() || slugify(property.name)).toLowerCase(),
          check_in_pin: /^\d{6}$/.test(times.pin) ? times.pin : null,
          timezone: "Europe/London",
          default_check_in_time: times.check_in,
          default_check_out_time: times.check_out,
          quiet_hours_start: times.quiet_start,
          quiet_hours_end: times.quiet_end,
        },
      });

      const named = rooms.map((r) => r.trim()).filter(Boolean);
      for (const [i, name] of named.entries()) {
        await addRoom({
          data: {
            property_id: created.id,
            display_name: name,
            room_number: null,
            public_title: null,
            description: null,
            max_guests: 2,
            has_ensuite: false,
            sort_order: i,
            active: true,
          },
        });
      }

      await qc.invalidateQueries();
      toast.success("Your rooms are set up");
      await navigate({ to: "/app/today" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  async function useDemo() {
    if (!workspace.data) return;
    setBusy(true);
    try {
      await demo({ data: { hostId: workspace.data.hostId } });
      await qc.invalidateQueries();
      await navigate({ to: "/app/today" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const canContinue =
    step === 0 ? property.name.trim().length > 1 : step === 1 ? rooms.some((r) => r.trim()) : true;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      <ol className="flex items-center gap-2">
        {steps.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span className="truncate text-sm font-medium">{label}</span>
          </li>
        ))}
      </ol>

      <div className="card-soft grid gap-4 p-5">
        {step === 0 ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Property name</Label>
              <Input
                id="name"
                className="h-12"
                value={property.name}
                onChange={(e) => setProperty((p) => ({ ...p, name: e.target.value }))}
                placeholder="The Trinity Rooms"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="addr">Address</Label>
                <Input
                  id="addr"
                  className="h-12"
                  value={property.address}
                  onChange={(e) => setProperty((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="post">Postcode</Label>
                <Input
                  id="post"
                  className="h-12"
                  value={property.postcode}
                  onChange={(e) => setProperty((p) => ({ ...p, postcode: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Short guest link</Label>
              <Input
                id="slug"
                className="h-12"
                value={property.short_code}
                onChange={(e) => setProperty((p) => ({ ...p, short_code: e.target.value }))}
                placeholder={slugify(property.name)}
              />
              <p className="text-xs text-muted-foreground">
                Guests will reach you at /p/{property.short_code.trim() || slugify(property.name)}
              </p>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Name the rooms you let. You can add more or rename them later.
            </p>
            {rooms.map((room, i) => (
              <div key={i} className="space-y-2">
                <Label htmlFor={`room-${i}`}>Room {i + 1}</Label>
                <Input
                  id={`room-${i}`}
                  className="h-12"
                  value={room}
                  onChange={(e) =>
                    setRooms((rs) => rs.map((r, j) => (j === i ? e.target.value : r)))
                  }
                  placeholder={["Garden Room", "Hill Room", "Loft Room"][i] ?? "Room name"}
                />
              </div>
            ))}
            <Button variant="outline" onClick={() => setRooms((rs) => [...rs, ""])}>
              Add another room
            </Button>
          </>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ci">Check-in from</Label>
              <Input
                id="ci"
                type="time"
                className="h-12"
                value={times.check_in}
                onChange={(e) => setTimes((t) => ({ ...t, check_in: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co">Check-out by</Label>
              <Input
                id="co"
                type="time"
                className="h-12"
                value={times.check_out}
                onChange={(e) => setTimes((t) => ({ ...t, check_out: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qs">Quiet hours from</Label>
              <Input
                id="qs"
                type="time"
                className="h-12"
                value={times.quiet_start}
                onChange={(e) => setTimes((t) => ({ ...t, quiet_start: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qe">Quiet hours until</Label>
              <Input
                id="qe"
                type="time"
                className="h-12"
                value={times.quiet_end}
                onChange={(e) => setTimes((t) => ({ ...t, quiet_end: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pin">Door PIN guests use (6 digits, optional)</Label>
              <Input
                id="pin"
                inputMode="numeric"
                maxLength={6}
                className="h-12"
                value={times.pin}
                onChange={(e) => setTimes((t) => ({ ...t, pin: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              {copy.back}
            </Button>
          ) : null}
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              {copy.next}
            </Button>
          ) : (
            <Button onClick={finish} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {copy.finish}
            </Button>
          )}
        </div>
      </div>

      <div className="text-center">
        <Button variant="ghost" onClick={useDemo} disabled={busy}>
          <Sparkles className="size-4" />
          {copy.orDemo}
        </Button>
      </div>
    </div>
  );
}
