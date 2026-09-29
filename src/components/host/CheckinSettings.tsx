import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MonitorSmartphone, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { checkinSettings as copy, common } from "@/content/copy";
import { normaliseMethods, type CheckinMethod } from "@/lib/checkin-logic";
import { saveCheckinMethods } from "@/lib/host.functions";

const KEYS: CheckinMethod[] = ["photo_id", "last4", "self_declare"];

export function CheckinSettings({
  property,
}: {
  property: { id: string; short_code: string; checkin_methods: unknown };
}) {
  const initial = normaliseMethods(property.checkin_methods);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [primary, setPrimary] = useState<CheckinMethod>(
    initial.order.find((m) => m !== "self_declare" && initial.enabled[m]) ?? "photo_id",
  );
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveCheckinMethods);
  const qc = useQueryClient();

  useEffect(() => {
    const m = normaliseMethods(property.checkin_methods);
    setEnabled(m.enabled);
    setPrimary(m.order.find((k) => k !== "self_declare" && m.enabled[k]) ?? "photo_id");
  }, [property.id, property.checkin_methods]);

  const idOff = !enabled.photo_id && !enabled.last4;

  async function onSave() {
    setBusy(true);
    try {
      const other: CheckinMethod = primary === "photo_id" ? "last4" : "photo_id";
      await save({
        data: { propertyId: property.id, methods: { order: [primary, other, "self_declare"], enabled } },
      });
      await qc.invalidateQueries({ queryKey: ["board"] });
      toast.success(copy.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/app/print/$propertyId" params={{ propertyId: property.id }}>
              <Printer className="size-4" /> {copy.printQr}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`/kiosk/${property.short_code}`} target="_blank" rel="noopener noreferrer">
              <MonitorSmartphone className="size-4" /> {copy.openKiosk}
            </a>
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {KEYS.map((k) => (
          <div key={k} className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
            <div>
              <Label htmlFor={`m-${k}`} className="text-base">
                {copy.methods[k]}
              </Label>
              <p className="text-sm text-muted-foreground">{copy.methodHelp[k]}</p>
            </div>
            <Switch
              id={`m-${k}`}
              checked={enabled[k]}
              onCheckedChange={(v) => setEnabled((e) => ({ ...e, [k]: v }))}
            />
          </div>
        ))}
      </div>

      {enabled.photo_id && enabled.last4 ? (
        <div className="mt-5">
          <p className="text-sm font-medium">{copy.primary}</p>
          <RadioGroup
            value={primary}
            onValueChange={(v) => setPrimary(v as CheckinMethod)}
            className="mt-2 flex flex-wrap gap-4"
          >
            {(["photo_id", "last4"] as const).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <RadioGroupItem id={`p-${k}`} value={k} />
                <Label htmlFor={`p-${k}`}>{copy.methods[k]}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      ) : null}

      <p className="mt-4 rounded-xl bg-muted p-3 text-sm">{idOff ? copy.listFlowNote : copy.fallbackNote}</p>

      <Button className="mt-4" onClick={onSave} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {common.save}
      </Button>
    </section>
  );
}
