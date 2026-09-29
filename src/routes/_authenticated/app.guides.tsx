import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, BookOpen, ImagePlus, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { guestGuideIcons } from "@/components/guest/guide-icons";
import { EmptyState } from "@/components/host/EmptyState";
import { PageHeader } from "@/components/host/PageHeader";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { common, guideCopy as copy } from "@/content/copy";
import { useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { SECTIONS, type SectionKey } from "@/lib/guide";
import {
  addStarterGuide,
  getGuideEditor,
  removeRoomSection,
  saveGuideSection,
  setRoomGuideMode,
  uploadGuidePhoto,
} from "@/lib/guide.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/guides")({
  head: () => ({
    meta: [
      { title: "Stay guides · Latchkey host dashboard" },
      { name: "description", content: "Edit the step-by-step stay guide for each room." },
    ],
  }),
  component: GuidesPage,
});

type Step = { heading: string; body: string | null; imagePath: string | null; imageUrl: string | null };
type Section = { roomId: string | null; sectionKey: SectionKey; summary: string | null; isStarter: boolean; steps: Step[] };

function GuidesPage() {
  const ws = useWorkspace();
  const properties = (ws.data?.properties ?? []) as Array<{ id: string; name: string }>;
  const { selectedId, select } = useSelectedProperty(properties);
  const fn = useServerFn(getGuideEditor);
  const q = useQuery({ queryKey: ["guide", selectedId], enabled: Boolean(selectedId), queryFn: () => fn({ data: { propertyId: selectedId! } }) });
  const [scope, setScope] = useState<string>("house");
  const qc = useQueryClient();
  const starter = useServerFn(addStarterGuide);
  const setMode = useServerFn(setRoomGuideMode);
  const [busy, setBusy] = useState(false);

  if (ws.isLoading) return <Skeleton className="mx-auto h-64 max-w-4xl rounded-2xl" />;
  if (!selectedId) return <EmptyState icon={BookOpen} title={copy.title} body="Add a property first." />;

  const rooms = q.data?.rooms ?? [];
  const sections = (q.data?.sections ?? []) as Section[];
  const roomId = scope === "house" ? null : scope;
  const room = rooms.find((r) => r.id === roomId);
  const houseCount = sections.filter((s) => s.roomId === null).length;

  async function runStarter() {
    setBusy(true);
    try {
      const r = await starter({ data: { propertyId: selectedId! } });
      toast.success(copy.starterAdded(r.added));
      await qc.invalidateQueries({ queryKey: ["guide", selectedId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  async function changeMode(mode: "basic" | "detailed") {
    if (!room) return;
    try {
      await setMode({ data: { roomId: room.id, mode } });
      await qc.invalidateQueries({ queryKey: ["guide", selectedId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <PropertyPicker properties={properties} value={selectedId} onChange={select} />
            {houseCount < SECTIONS.length ? (
              <Button variant="outline" onClick={runStarter} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {copy.addStarter}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="card-soft flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-1">
          <Label>Editing</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="h-12 w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="house">{copy.scopeHouse}</SelectItem>
              {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {room ? (
          <div className="space-y-1">
            <Label>{copy.modeLabel}</Label>
            <div role="radiogroup" className="flex rounded-full bg-muted p-1">
              {(["basic", "detailed"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={room.guide_mode === m}
                  onClick={() => changeMode(m)}
                  className={cn("spring min-h-10 rounded-full px-4 text-sm font-medium", room.guide_mode === m ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground")}
                >
                  {m === "basic" ? copy.basic : copy.detailed}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <p className="basis-full text-sm text-muted-foreground">{room ? copy.basicHelp : copy.scopeHelp}</p>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <Accordion type="single" collapsible className="space-y-3">
          {SECTIONS.map((s) => {
            const own = sections.find((x) => x.sectionKey === s.key && x.roomId === roomId) ?? null;
            const house = roomId ? sections.find((x) => x.sectionKey === s.key && x.roomId === null) ?? null : null;
            const Icon = guestGuideIcons[s.key];
            return (
              <AccordionItem key={`${scope}-${s.key}`} value={s.key} className="card-soft border-0 px-4">
                <AccordionTrigger className="min-h-14 hover:no-underline">
                  <span className="flex flex-wrap items-center gap-3 text-left">
                    <Icon className="size-5 text-primary" aria-hidden />
                    <span className="font-display text-lg">{s.title}</span>
                    {own?.isStarter ? <Badge variant="secondary">{copy.starterBadge}</Badge> : null}
                    {roomId && own ? <Badge>{copy.roomOwn}</Badge> : null}
                    {!own && !house ? <span className="text-xs font-normal text-muted-foreground">Empty</span> : null}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <SectionEditor
                    propertyId={selectedId}
                    roomId={roomId}
                    sectionKey={s.key}
                    hint={s.hint}
                    own={own}
                    inherited={house}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

function SectionEditor({
  propertyId, roomId, sectionKey, hint, own, inherited,
}: {
  propertyId: string; roomId: string | null; sectionKey: SectionKey; hint: string; own: Section | null; inherited: Section | null;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveGuideSection);
  const upload = useServerFn(uploadGuidePhoto);
  const removeOwn = useServerFn(removeRoomSection);
  const start = own ?? inherited;
  const [summary, setSummary] = useState(start?.summary ?? "");
  const [steps, setSteps] = useState<Step[]>(start?.steps ?? []);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setSummary(start?.summary ?? "");
    setSteps(start?.steps ?? []);
  }, [own, inherited]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (i: number, p: Partial<Step>) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const c = [...xs];
      [c[i], c[j]] = [c[j]!, c[i]!];
      return c;
    });

  async function onPhoto(i: number, file: File | undefined) {
    if (!file) return;
    setBusy(`photo-${i}`);
    try {
      const dataUrl = await shrink(file);
      const r = await upload({ data: { propertyId, dataUrl } });
      patch(i, { imagePath: r.path, imageUrl: r.url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy("save");
    try {
      await save({
        data: {
          propertyId, roomId, sectionKey,
          summary: summary.trim() || null,
          steps: steps.map((s) => ({ heading: s.heading, body: s.body, imagePath: s.imagePath })),
        },
      });
      await qc.invalidateQueries({ queryKey: ["guide", propertyId] });
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  async function revert() {
    if (!roomId) return;
    setBusy("revert");
    try {
      await removeOwn({ data: { propertyId, roomId, sectionKey } });
      await qc.invalidateQueries({ queryKey: ["guide", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 pb-2">
      <p className="text-sm text-muted-foreground">{roomId && !own && inherited ? copy.inherits : hint}</p>
      <div className="space-y-1">
        <Label htmlFor={`sum-${sectionKey}`}>{copy.summary}</Label>
        <Textarea id={`sum-${sectionKey}`} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500} />
      </div>

      <ol className="space-y-3">
        {steps.map((st, i) => (
          <li key={i} className="rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <Input aria-label={copy.stepHeading} placeholder={copy.stepHeading} className="h-11" value={st.heading} onChange={(e) => patch(i, { heading: e.target.value })} maxLength={120} />
                <Textarea aria-label={copy.stepBody} placeholder={copy.stepBody} value={st.body ?? ""} onChange={(e) => patch(i, { body: e.target.value })} maxLength={2000} />
                {st.imageUrl || st.imagePath ? (
                  <div className="relative inline-block">
                    {st.imageUrl ? <img src={st.imageUrl} alt="" className="max-h-40 rounded-xl object-cover" /> : <span className="text-sm">Photo attached</span>}
                    <Button type="button" size="icon" variant="secondary" className="absolute right-1 top-1 size-8" aria-label={copy.removePhoto} onClick={() => patch(i, { imagePath: null, imageUrl: null })}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm">
                    {busy === `photo-${i}` ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    {copy.addPhoto}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onPhoto(i, e.target.files?.[0])} />
                  </label>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button type="button" size="icon" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === steps.length - 1}><ArrowDown className="size-4" /></Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Delete step" onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setSteps((xs) => [...xs, { heading: "", body: "", imagePath: null, imageUrl: null }])} disabled={steps.length >= 20}>
          <Plus className="size-4" /> {copy.addStep}
        </Button>
        <Button type="button" onClick={submit} disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : null}
          {copy.save}
        </Button>
        {roomId && own ? (
          <Button type="button" variant="ghost" onClick={revert} disabled={busy !== null}>{copy.useHouse}</Button>
        ) : null}
      </div>
    </div>
  );
}

/** Resizes photos to at most 1600px so uploads stay small on phone connections. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("That photo couldn't be read."));
    img.src = URL.createObjectURL(file);
  });
}
