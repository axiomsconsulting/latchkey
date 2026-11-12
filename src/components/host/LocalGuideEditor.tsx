import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, MapPin, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { common, guideExtrasAdminCopy as copy, guideExtrasCopy as gcopy } from "@/content/copy";
import {
  getLocalGuideSettings,
  refreshLocalGuide,
  saveLocalGuide,
} from "@/lib/guest-extras.functions";
import {
  PLACE_CATEGORIES,
  distanceText,
  type LocalGuide,
  type Place,
  readWhere,
  type PlaceCategory,
} from "@/lib/local-guide";
import { cn } from "@/lib/utils";

const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

/** Stay guides → Around here (local-guide.ts): kinds of place, the host's picks and events, hiding places. */
export function LocalGuideEditor({ propertyId }: { propertyId: string }) {
  const getFn = useServerFn(getLocalGuideSettings);
  const saveFn = useServerFn(saveLocalGuide);
  const refreshFn = useServerFn(refreshLocalGuide);
  const qc = useQueryClient();
  const key = ["local-guide", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { propertyId } }) });
  const [g, setG] = useState<LocalGuide | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [where, setWhere] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) setG(q.data.settings);
  }, [q.data]);
  if (q.isLoading || !q.data || !g) return <Skeleton className="h-32 rounded-2xl" />;
  const d = q.data;
  const dirty = changed(g, d.settings);
  const set = (patch: Partial<LocalGuide>) => setG((x) => (x ? { ...x, ...patch } : x));

  async function act(name: string, f: () => Promise<string>) {
    setBusy(name);
    try {
      toast.success(await f());
      await qc.invalidateQueries({ queryKey: key });
      await qc.invalidateQueries({ queryKey: ["guide-extras"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5" data-tour="local-guide">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg">
            <MapPin className="size-5 text-primary" /> {copy.localTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.localBody}</p>
        </div>
        <SaveButton
          dirty={dirty}
          busy={busy === "save"}
          onClick={() =>
            void act("save", async () => {
              await saveFn({ data: { propertyId, settings: g as never } });
              return copy.saved;
            })
          }
        />
      </div>
      {!d.available ? null : (
        <>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={g.on} onCheckedChange={(on) => set({ on })} />
            {copy.localOn}
          </label>
          <div className="space-y-1.5">
            <Label>{copy.kinds}</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLACE_CATEGORIES.map((c) => {
                const on = g.categories.includes(c);
                return (
                  <Button
                    key={c}
                    size="sm"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        categories: on ? g.categories.filter((x) => x !== c) : [...g.categories, c],
                      })
                    }
                  >
                    {gcopy.categories[c]}
                  </Button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={g.eventsOn}
              onCheckedChange={(eventsOn) => set({ eventsOn })}
              disabled={!d.eventsAvailable}
            />
            <span>
              {copy.eventsOn}
              {!d.eventsAvailable ? (
                <span className="block text-xs text-muted-foreground">{copy.eventsOff}</span>
              ) : null}
            </span>
          </label>

          {/* The host's picks. */}
          <div className="space-y-2">
            <Label>{copy.picks}</Label>
            {g.picks.map((p, n) => (
              <div
                key={p.id}
                className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_10rem_auto]"
              >
                <Input
                  value={p.name}
                  maxLength={80}
                  placeholder={copy.pickName}
                  onChange={(e) =>
                    set({
                      picks: g.picks.map((x, i) => (i === n ? { ...x, name: e.target.value } : x)),
                    })
                  }
                />
                <Select
                  value={p.category}
                  onValueChange={(v) =>
                    set({
                      picks: g.picks.map((x, i) =>
                        i === n ? { ...x, category: v as PlaceCategory } : x,
                      ),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLACE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {gcopy.categories[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={copy.remove}
                  onClick={() => set({ picks: g.picks.filter((_, i) => i !== n) })}
                >
                  <Trash2 className="size-4" />
                </Button>
                <Input
                  className="sm:col-span-3"
                  value={p.note}
                  maxLength={300}
                  placeholder={copy.pickNote}
                  onChange={(e) =>
                    set({
                      picks: g.picks.map((x, i) => (i === n ? { ...x, note: e.target.value } : x)),
                    })
                  }
                />
                <Input
                  className="sm:col-span-3"
                  value={
                    where[p.id] ?? (p.lat !== null && p.lng !== null ? `${p.lat}, ${p.lng}` : "")
                  }
                  placeholder={copy.pickWhere}
                  onChange={(e) => {
                    const v = e.target.value;
                    setWhere((w) => ({ ...w, [p.id]: v }));
                    const at = readWhere(v);
                    set({
                      picks: g.picks.map((x, i) =>
                        i === n
                          ? {
                              ...x,
                              lat: at?.lat ?? null,
                              lng: at?.lng ?? null,
                              url: /^https:\/\//.test(v.trim()) ? v.trim() : x.url,
                            }
                          : x,
                      ),
                    });
                  }}
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set({
                  picks: [
                    ...g.picks,
                    {
                      id: rid("pick"),
                      name: "",
                      category: "food",
                      note: "",
                      lat: null,
                      lng: null,
                      url: null,
                    },
                  ],
                })
              }
            >
              <Plus className="size-4" />
              {copy.addPick}
            </Button>
          </div>

          {/* The host's events. */}
          <div className="space-y-2">
            <Label>{copy.events}</Label>
            {g.events.map((e, n) => (
              <div
                key={e.id}
                className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_9rem_6rem_auto]"
              >
                <Input
                  value={e.name}
                  maxLength={100}
                  placeholder={copy.eventName}
                  onChange={(x) =>
                    set({
                      events: g.events.map((y, i) =>
                        i === n ? { ...y, name: x.target.value } : y,
                      ),
                    })
                  }
                />
                <Input
                  type="date"
                  value={e.date}
                  aria-label={copy.eventDate}
                  onChange={(x) =>
                    set({
                      events: g.events.map((y, i) =>
                        i === n ? { ...y, date: x.target.value } : y,
                      ),
                    })
                  }
                />
                <Input
                  type="time"
                  value={e.time ?? ""}
                  aria-label={copy.eventTime}
                  onChange={(x) =>
                    set({
                      events: g.events.map((y, i) =>
                        i === n ? { ...y, time: x.target.value || null } : y,
                      ),
                    })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={copy.remove}
                  onClick={() => set({ events: g.events.filter((_, i) => i !== n) })}
                >
                  <Trash2 className="size-4" />
                </Button>
                <Input
                  className="sm:col-span-4"
                  value={e.venue ?? ""}
                  maxLength={100}
                  placeholder={copy.eventVenue}
                  onChange={(x) =>
                    set({
                      events: g.events.map((y, i) =>
                        i === n ? { ...y, venue: x.target.value || null } : y,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set({
                  events: [
                    ...g.events,
                    { id: rid("event"), name: "", date: "", time: null, venue: null, url: null },
                  ],
                })
              }
            >
              <Plus className="size-4" />
              {copy.addEvent}
            </Button>
          </div>

          {/* What was read, with hide and show. */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{copy.readPlaces}</Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {d.fetchedAt
                  ? copy.lastRead(
                      new Date(d.fetchedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      }),
                    )
                  : copy.notRead}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    void act("refresh", async () => {
                      const r = await refreshFn({ data: { propertyId } });
                      return copy.refreshed(r.places, r.events);
                    })
                  }
                >
                  <RefreshCw className={cn("size-4", busy === "refresh" && "animate-spin")} />
                  {copy.refresh}
                </Button>
              </div>
            </div>
            {d.noLocation ? <p className="text-sm text-destructive">{copy.noLocation}</p> : null}
            <ul className="grid max-h-80 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {(d.places as Place[]).map((p) => {
                const off = g.hidden.includes(p.id);
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border border-border p-2 text-sm",
                      off && "opacity-50",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {p.name}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · {gcopy.categories[p.category]} · {distanceText(p.metres)}
                        {off ? ` · ${copy.hidden}` : ""}
                      </span>
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={off ? copy.show : copy.hide}
                      onClick={() =>
                        set({
                          hidden: off ? g.hidden.filter((x) => x !== p.id) : [...g.hidden, p.id],
                        })
                      }
                    >
                      {off ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
