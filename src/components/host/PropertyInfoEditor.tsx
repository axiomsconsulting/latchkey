import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Info, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { INFO_ICON } from "@/components/guest/info-icons";
import { RichTextField } from "@/components/host/RichTextField";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { common, guideExtrasAdminCopy as copy } from "@/content/copy";
import { getPropertyInfo, savePropertyInfo, uploadInfoImage } from "@/lib/guest-extras.functions";
import { shrinkPhoto } from "@/lib/photo-file";
import {
  INFO_ICONS,
  MAX_INFO_FIELDS,
  MAX_INFO_IMAGES,
  MAX_INFO_ITEMS,
  type InfoItem,
} from "@/lib/property-info";
import { cn } from "@/lib/utils";

const newId = () => `info-${Math.random().toString(36).slice(2, 10)}`;

/** Stay guides → Property information (property-info.ts): icons that open to notes, details and photos. */
export function PropertyInfoEditor({ propertyId }: { propertyId: string }) {
  const getFn = useServerFn(getPropertyInfo);
  const saveFn = useServerFn(savePropertyInfo);
  const uploadFn = useServerFn(uploadInfoImage);
  const qc = useQueryClient();
  const key = ["property-info", propertyId];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { propertyId } }) });
  const [items, setItems] = useState<InfoItem[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setItems(q.data.items);
    setPreviews(q.data.previews);
  }, [q.data]);
  if (q.isLoading || !q.data) return <Skeleton className="h-32 rounded-2xl" />;
  const dirty = changed(items, q.data.items);
  const set = (id: string, patch: Partial<InfoItem>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId, items: items as never } });
      await qc.invalidateQueries({ queryKey: key });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto(item: InfoItem, file: File) {
    try {
      const r = await uploadFn({
        data: { propertyId, dataUrl: await shrinkPhoto(file, 1600, 0.82) },
      });
      set(item.id, { images: [...item.images, r.path] });
      if (r.url) setPreviews((p) => ({ ...p, [r.path]: r.url! }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5" data-tour="property-info">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg">
            <Info className="size-5 text-primary" /> {copy.infoTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.infoBody}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy} onClick={() => void save()} />
      </div>
      {!q.data.available ? null : items.length ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = INFO_ICON[item.icon];
            const open = openId === item.id;
            return (
              <li key={item.id} className="rounded-xl border border-border">
                <div className="flex items-center gap-2 p-2">
                  <Popover>
                    <PopoverTrigger
                      aria-label={copy.itemIcon}
                      className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-primary"
                    >
                      <Icon className="size-5" />
                    </PopoverTrigger>
                    <PopoverContent className="grid w-72 grid-cols-6 gap-1">
                      {INFO_ICONS.map((k) => {
                        const I = INFO_ICON[k];
                        return (
                          <button
                            key={k}
                            type="button"
                            aria-label={k}
                            onClick={() => set(item.id, { icon: k })}
                            className={cn(
                              "grid size-10 place-items-center rounded-lg",
                              item.icon === k
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted",
                            )}
                          >
                            <I className="size-5" />
                          </button>
                        );
                      })}
                    </PopoverContent>
                  </Popover>
                  <Input
                    value={item.title}
                    maxLength={60}
                    placeholder={copy.itemTitle}
                    aria-label={copy.itemTitle}
                    onChange={(e) => set(item.id, { title: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenId(open ? null : item.id)}
                  >
                    {open ? copy.done : common.edit}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={copy.remove}
                    onClick={() => setItems((xs) => xs.filter((x) => x.id !== item.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {open ? (
                  <div className="space-y-3 border-t border-border p-3">
                    <div className="space-y-1.5">
                      <Label>{copy.fields}</Label>
                      {item.fields.map((f, n) => (
                        <div key={n} className="flex gap-2">
                          <Input
                            value={f.label}
                            maxLength={40}
                            placeholder={copy.fieldLabel}
                            onChange={(e) =>
                              set(item.id, {
                                fields: item.fields.map((x, i) =>
                                  i === n ? { ...x, label: e.target.value } : x,
                                ),
                              })
                            }
                          />
                          <Input
                            value={f.value}
                            maxLength={200}
                            placeholder={copy.fieldValue}
                            onChange={(e) =>
                              set(item.id, {
                                fields: item.fields.map((x, i) =>
                                  i === n ? { ...x, value: e.target.value } : x,
                                ),
                              })
                            }
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={copy.remove}
                            onClick={() =>
                              set(item.id, { fields: item.fields.filter((_, i) => i !== n) })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                      {item.fields.length < MAX_INFO_FIELDS ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            set(item.id, { fields: [...item.fields, { label: "", value: "" }] })
                          }
                        >
                          <Plus className="size-4" />
                          {copy.addField}
                        </Button>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label>{copy.notes}</Label>
                      <RichTextField
                        value={item.notes}
                        maxLength={2000}
                        ariaLabel={copy.notes}
                        onChange={(notes) => set(item.id, { notes })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{copy.photos}</Label>
                      <div className="flex flex-wrap gap-2">
                        {item.images.map((path) => (
                          <div key={path} className="relative">
                            {previews[path] ? (
                              <img
                                src={previews[path]}
                                alt=""
                                className="h-20 w-28 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="h-20 w-28 rounded-lg bg-muted" />
                            )}
                            <button
                              type="button"
                              aria-label={copy.remove}
                              onClick={() =>
                                set(item.id, { images: item.images.filter((x) => x !== path) })
                              }
                              className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}
                        {item.images.length < MAX_INFO_IMAGES ? (
                          <label className="grid h-20 w-28 cursor-pointer place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted">
                            <ImagePlus className="size-5" aria-hidden />
                            <span className="sr-only">{copy.addPhoto}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) void addPhoto(item, f);
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.noItems}</p>
      )}
      {items.length < MAX_INFO_ITEMS && q.data.available ? (
        <Button
          variant="outline"
          onClick={() => {
            const id = newId();
            setItems((xs) => [
              ...xs,
              { id, icon: "info", title: "", notes: "", fields: [], images: [] },
            ]);
            setOpenId(id);
          }}
        >
          <Plus className="size-4" />
          {copy.addItem}
        </Button>
      ) : null}
    </section>
  );
}
