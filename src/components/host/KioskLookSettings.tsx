import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { InfoTip } from "@/components/host/InfoTip";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Switch } from "@/components/ui/switch";
import { common, themeStudio as copy } from "@/content/copy";
import { pingKiosk } from "@/lib/kiosk-ping";
import { saveKioskLook } from "@/lib/services.functions";
import { normaliseTheme } from "@/lib/theme";

type Look = {
  kioskLook: "auto" | "standard" | "xl" | "jumbo";
  kioskTouch: "standard" | "expanded";
  kioskFlash: boolean;
  kioskSounds: boolean;
};

/**
 * Settings → Kiosk: how the door tablet looks (Standard, Express or
 * Latchkey's choice) and how big its buttons are. Kept in the property's
 * theme, so Express follows the rest of its look.
 */
export function KioskLookSettings({
  property,
}: {
  property: { id: string; short_code: string; theme_config?: unknown };
}) {
  const start = (): Look => {
    const t = normaliseTheme(property.theme_config);
    return {
      kioskLook: t.kioskLook,
      kioskTouch: t.kioskTouch,
      kioskFlash: t.kioskFlash,
      kioskSounds: t.kioskSounds,
    };
  };
  const [form, setForm] = useState<Look>(start);
  const [saved, setSaved] = useState<Look>(start);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveKioskLook);
  const qc = useQueryClient();
  useEffect(() => {
    const s = start();
    setForm(s);
    setSaved(s);
    // A new property, or its theme saved elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, property.theme_config]);

  async function onSave() {
    setBusy(true);
    try {
      await save({ data: { propertyId: property.id, ...form } });
      setSaved(form);
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      void pingKiosk(property.short_code);
      toast.success(copy.kioskSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const choice = <K extends "kioskLook" | "kioskTouch">(
    k: K,
    v: Look[K],
    label: string,
    help: string,
  ) => (
    <button
      key={v}
      type="button"
      role="radio"
      aria-checked={form[k] === v}
      onClick={() => setForm({ ...form, [k]: v })}
      className={`rounded-xl border p-3 text-left text-sm transition-colors ${form[k] === v ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-secondary"}`}
    >
      <span className="block font-medium">{label}</span>
      <span className="block truncate text-muted-foreground">{help}</span>
    </button>
  );
  const toggle = (k: "kioskFlash" | "kioskSounds", label: string, help: string) => (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <span className="min-w-0 text-sm">
        <span className="block font-medium">{label}</span>
        <span className="block text-muted-foreground">{help}</span>
      </span>
      <Switch checked={form[k]} onCheckedChange={(on) => setForm({ ...form, [k]: on })} />
    </label>
  );
  const heading = (text: string, info: React.ReactNode) => (
    <p className="flex items-center gap-1 text-sm font-medium">
      {text}
      <InfoTip label={text}>{info}</InfoTip>
    </p>
  );

  return (
    <div className="card-soft space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl">{copy.kioskGroup}</h2>
        <SaveButton dirty={changed(form, saved)} busy={busy} onClick={() => void onSave()} />
      </div>
      {heading(
        copy.kioskLook,
        <div className="space-y-2">
          {copy.kioskLookInfo.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>,
      )}
      <div
        role="radiogroup"
        aria-label={copy.kioskLook}
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        {(["auto", "standard", "xl", "jumbo"] as const).map((v) =>
          choice("kioskLook", v, copy.kioskLooks[v].label, copy.kioskLooks[v].help),
        )}
      </div>
      {heading(copy.kioskTouch, copy.kioskTouchInfo)}
      <div role="radiogroup" aria-label={copy.kioskTouch} className="grid gap-2 sm:grid-cols-2">
        {(["standard", "expanded"] as const).map((v) =>
          choice("kioskTouch", v, copy.kioskTouches[v].label, copy.kioskTouches[v].help),
        )}
      </div>
      {heading(copy.kioskExtras, copy.kioskExtrasInfo)}
      <div className="grid gap-2 sm:grid-cols-2">
        {toggle("kioskFlash", copy.kioskFlash, copy.kioskFlashHelp)}
        {toggle("kioskSounds", copy.kioskSounds, copy.kioskSoundsHelp)}
      </div>
    </div>
  );
}
