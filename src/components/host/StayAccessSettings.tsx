import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QrCode, Tablet, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { common, stayAccessCopy as copy } from "@/content/copy";
import { normaliseStayAccess, type StayAccess } from "@/lib/stay-access";
import { forgetTablet, getStayAccess, saveStayAccess } from "@/lib/stay-access.functions";
import { cn } from "@/lib/utils";

/**
 * Settings → Guests → Room QR codes and Wi-Fi, for one property: whether the
 * room QR opens the guest's own guide before check-in (and how their phone
 * is shown to be here), the door tablets that make that check, the message
 * from the second day of a stay, and keeping the Wi-Fi password until check-in.
 */
export function StayAccessSettings({ propertyId }: { propertyId: string }) {
  const fetchFn = useServerFn(getStayAccess);
  const saveFn = useServerFn(saveStayAccess);
  const forgetFn = useServerFn(forgetTablet);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["stay-access", propertyId],
    queryFn: () => fetchFn({ data: { propertyId } }),
  });
  const [form, setForm] = useState<StayAccess | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setForm(q.data.settings);
  }, [q.data]);

  if (q.isLoading || !q.data || !form) return <Skeleton className="h-64 rounded-2xl" />;
  const d = q.data;
  const next = normaliseStayAccess(form);
  const set = (patch: Partial<StayAccess>) => setForm((f) => f && { ...f, ...patch });
  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  async function save() {
    setBusy(true);
    try {
      // Only this card's fields (reviews have their own card).
      const { roomQrEarly, presence, stayMessage, wifiAfterCheckIn } = next;
      await saveFn({
        data: { propertyId, settings: { roomQrEarly, presence, stayMessage, wifiAfterCheckIn } },
      });
      await qc.invalidateQueries({ queryKey: ["stay-access", propertyId] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const row = (
    id: string,
    label: string,
    help: string,
    checked: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0 text-sm">
        <Label htmlFor={id} className="text-base">
          {label}
        </Label>
        <p className="text-muted-foreground">{help}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg">
            <QrCode className="size-5 text-primary" /> {copy.title}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {d.available ? (
          <SaveButton
            dirty={changed(
              [next.roomQrEarly, next.presence, next.stayMessage, next.wifiAfterCheckIn],
              [
                d.settings.roomQrEarly,
                d.settings.presence,
                d.settings.stayMessage,
                d.settings.wifiAfterCheckIn,
              ],
            )}
            busy={busy}
            onClick={() => void save()}
          />
        ) : null}
      </div>
      {!d.available ? <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p> : null}

      {row("sa-early", copy.early, copy.earlyHelp, form.roomQrEarly, (v) =>
        set({ roomQrEarly: v }),
      )}

      {form.roomQrEarly ? (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{copy.presence}</legend>
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
              {(["network", "network_or_location"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={form.presence === k}
                  onClick={() => set({ presence: k })}
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm",
                    form.presence === k
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-secondary",
                  )}
                >
                  <span className="block font-medium">
                    {k === "network" ? copy.presenceNetwork : copy.presenceBoth}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {k === "network" ? copy.presenceNetworkHelp : copy.presenceBothHelp}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Tablet className="size-4 text-primary" /> {copy.tablets}
            </p>
            {d.tablets.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {d.tablets.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      {copy.tabletLine(
                        when(t.last_seen_at),
                        !!t.located_at,
                        copy.pairedBy[t.paired_by] ?? "",
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label={copy.forget}
                      onClick={() =>
                        void forgetFn({ data: { id: t.id } })
                          .then(() =>
                            qc.invalidateQueries({ queryKey: ["stay-access", propertyId] }),
                          )
                          .then(
                            () => toast.success(copy.forgotten),
                            (e: unknown) =>
                              toast.error(e instanceof Error ? e.message : common.errorBody),
                          )
                      }
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-muted p-3 text-sm">{copy.tabletsNone}</p>
            )}
          </div>
        </>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor="sa-message">{copy.message}</Label>
        <Textarea
          id="sa-message"
          rows={2}
          maxLength={280}
          value={form.stayMessage}
          onChange={(e) => set({ stayMessage: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">{copy.messageHelp}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{copy.wifiTitle}</p>
        {row("sa-wifi", copy.wifiAfter, copy.wifiAfterHelp, form.wifiAfterCheckIn, (v) =>
          set({ wifiAfterCheckIn: v }),
        )}
      </div>
    </section>
  );
}
