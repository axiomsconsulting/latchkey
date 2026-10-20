import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLandOn } from "@/hooks/use-land-on";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, BookOpen, Check, ExternalLink, ImagePlus, Loader2, Plus, Printer, QrCode, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { sectionIcon } from "@/components/guest/guide-icons";
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
import { common, guideAttachCopy, guideCopy as copy, inRoomCopy as roomCopy } from "@/content/copy";
import { useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { GuideSectionList } from "@/components/host/GuideSectionList";
import { SectionAttachments } from "@/components/host/SectionAttachments";
import { getGuideAttachments } from "@/lib/attachments.functions";
import { RoomAmenities } from "@/components/host/RoomAmenities";
import { SECTIONS, editorSections, type SectionKey } from "@/lib/guide";
import { getRoomGuideCodes, renameGuideSection } from "@/lib/guide.functions";
import {
  addStarterGuide,
  getGuideEditor,
  removeRoomSection,
  saveGuideSection,
  setRoomGuideMode,
  uploadGuidePhoto,
} from "@/lib/guide.functions";
import { cn } from "@/lib/utils";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/app/guides")({
  // ?section=<section key> opens that section; ?room=<room id> opens that room's guide.
  validateSearch: (s: Record<string, unknown>): { section?: string; room?: string } => ({
    ...(typeof s["section"] === "string" ? { section: s["section"] } : {}),
    ...(typeof s["room"] === "string" ? { room: s["room"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: rebrand("Stay guides · Latchkey host dashboard") },
      { name: "description", content: "Edit the step-by-step stay guide for each room." },
    ],
  }),
  component: GuidesPage,
});

type Step = { heading: string; body: string | null; imagePath: string | null; imageUrl: string | null };
type Section = {
  roomId: string | null;
  sectionKey: SectionKey;
  summary: string | null;
  isStarter: boolean;
  pinned: boolean;
  sortOrder: number;
  title?: string;
  published?: boolean;
  steps: Step[];
};

function GuidesPage() {
  const ws = useWorkspace();
  const properties = (ws.data?.properties ?? []) as Array<{ id: string; name: string }>;
  const { selectedId, select } = useSelectedProperty(properties);
  const fn = useServerFn(getGuideEditor);
  const q = useQuery({ queryKey: ["guide", selectedId], enabled: Boolean(selectedId), queryFn: () => fn({ data: { propertyId: selectedId! } }) });
  const attachFn = useServerFn(getGuideAttachments);
  const attach = useQuery({ queryKey: ["guide-attachments", selectedId], enabled: Boolean(selectedId), queryFn: () => attachFn({ data: { propertyId: selectedId! } }) });
  const { section: linkedSection, room: linkedRoom } = Route.useSearch();
  const [scope, setScope] = useState<string>(linkedRoom ?? "house");
  useEffect(() => {
    if (linkedRoom) setScope(linkedRoom);
  }, [linkedRoom]);
  useLandOn(linkedSection ? `guide-${linkedSection}` : null, !q.isLoading);
  const qc = useQueryClient();
  const starter = useServerFn(addStarterGuide);
  const setMode = useServerFn(setRoomGuideMode);
  const [busy, setBusy] = useState(false);

  if (ws.isLoading) return <Skeleton className="mx-auto h-64 max-w-4xl rounded-2xl" />;
  if (!selectedId) return <EmptyState icon={BookOpen} title={copy.title} body="Add a property first." />;

  const rooms = (q.data?.rooms ?? []) as Array<{ id: string; display_name: string; guide_mode: string; amenities?: unknown }>;
  const sections = (q.data?.sections ?? []) as Section[];
  const roomId = scope === "house" ? null : scope;
  const room = rooms.find((r) => r.id === roomId);
  const houseCount = sections.filter((s) => s.roomId === null).length;
  const { shown, removed } = editorSections(sections, (q.data as { startersOff?: string[] } | undefined)?.startersOff ?? []);
  const pinned = new Set(sections.filter((s) => s.roomId === null && s.pinned).map((s) => s.sectionKey));
  const roomAmenities = Array.isArray(room?.amenities) ? (room.amenities as unknown[]).filter((a): a is string => typeof a === "string") : [];

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

      <InRoomGuides propertyId={selectedId} />

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

      {q.isLoading ? null : room ? <RoomAmenities propertyId={selectedId} roomId={room.id} amenities={roomAmenities} /> : null}

      {q.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{roomId ? copy.listHelpRoom : copy.listHelp}</p>
          <GuideSectionList
            attachmentCount={(key) => attach.data?.bySection[key]?.length ?? 0}
            propertyId={selectedId}
            shown={shown}
            removed={removed}
            pinned={pinned}
            manage={!roomId}
            openKey={linkedSection ?? null}
            badges={(sec) => {
              const own = sections.find((x) => x.sectionKey === sec.key && x.roomId === roomId) ?? null;
              const house = roomId ? sections.find((x) => x.sectionKey === sec.key && x.roomId === null) ?? null : null;
              return (
                <>
                  {own?.isStarter ? <Badge variant="secondary">{copy.starterBadge}</Badge> : null}
                  {roomId && own ? <Badge>{copy.roomOwn}</Badge> : null}
                  {sec.custom ? <Badge variant="outline">{copy.yourSection}</Badge> : null}
                  {!own?.summary && !own?.steps.length && !house?.summary && !house?.steps.length ? (
                    <span className="text-xs font-normal text-muted-foreground">{copy.emptyBadge}</span>
                  ) : null}
                </>
              );
            }}
          >
            {(sec) => {
              const own = sections.find((x) => x.sectionKey === sec.key && x.roomId === roomId) ?? null;
              const house = roomId ? sections.find((x) => x.sectionKey === sec.key && x.roomId === null) ?? null : null;
              return (
                <div className="space-y-4">
                  {sec.custom && !roomId ? <RenameSection propertyId={selectedId} sectionKey={sec.key} title={sec.title} /> : null}
                  <SectionEditor
                    key={`${scope}-${sec.key}`}
                    propertyId={selectedId}
                    roomId={roomId}
                    sectionKey={sec.key}
                    hint={sec.hint}
                    own={own}
                    inherited={house}
                  />
                  {roomId ? (
                    <p className="text-xs text-muted-foreground">{guideAttachCopy.roomNote}</p>
                  ) : (
                    <SectionAttachments propertyId={selectedId} sectionKey={sec.key} items={attach.data?.bySection[sec.key] ?? []} ready={attach.data?.ready === true} />
                  )}
                </div>
              );
            }}
          </GuideSectionList>
        </>
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

/**
 * The nudge and the tools for in-room guides: a QR code in each room that
 * opens how that room works, with a way to message the host.
 */
function InRoomGuides({ propertyId }: { propertyId: string }) {
  const codesFn = useServerFn(getRoomGuideCodes);
  const q = useQuery({ queryKey: ["room-guide-codes", propertyId], queryFn: () => codesFn({ data: { propertyId } }) });
  const rooms = q.data?.rooms ?? [];
  const [why, setWhy] = useState(false);
  return (
    <section className="rounded-3xl border-2 border-primary/30 bg-primary/5 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <QrCode className="size-6" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-xl">{roomCopy.title}</h2>
            {/* The why, open on wider screens; one tap away on a phone. */}
            <button type="button" className="text-sm font-medium text-primary sm:hidden" aria-expanded={why} onClick={() => setWhy((w) => !w)}>
              {why ? roomCopy.whyHide : roomCopy.why}
            </button>
            <div className={cn(why ? "block" : "hidden", "sm:block")}>
              <p className="mt-1 text-muted-foreground">{roomCopy.body}</p>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {roomCopy.points.map((pt) => (
                  <li key={pt} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {pt}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        {rooms.length > 1 ? (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/app/room-qr/$propertyId" params={{ propertyId }}>
              <Printer className="size-4" /> {roomCopy.printAll(rooms.length)}
            </Link>
          </Button>
        ) : null}
      </div>
      {q.isLoading ? <Skeleton className="mt-4 h-16 rounded-xl" /> : null}
      {q.data && !q.data.available ? <p className="mt-4 rounded-xl bg-muted p-3 text-sm">{roomCopy.notReady}</p> : null}
      {rooms.length ? (
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
          {rooms.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 basis-32 truncate font-medium">{r.name}</span>
              {r.code ? (
                <>
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/room/${r.code}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" /> {roomCopy.preview}
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app/room-qr/$propertyId" params={{ propertyId }} search={{ room: r.id }}>
                      <Printer className="size-4" /> {roomCopy.printQr}
                    </Link>
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{roomCopy.askOwner}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** The host's own section: change its name. */
function RenameSection({ propertyId, sectionKey, title }: { propertyId: string; sectionKey: SectionKey; title: string }) {
  const rename = useServerFn(renameGuideSection);
  const qc = useQueryClient();
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void rename({ data: { propertyId, sectionKey, title: value } })
          .then(() => qc.invalidateQueries({ queryKey: ["guide", propertyId] }))
          .then(() => toast.success(copy.renamed))
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : common.errorBody));
      }}
    >
      <div className="min-w-56 flex-1 space-y-1">
        <Label htmlFor={`title-${sectionKey}`}>{copy.sectionName}</Label>
        <Input id={`title-${sectionKey}`} value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
      </div>
      <Button type="submit" variant="outline" disabled={!value.trim() || value.trim() === title}>
        {common.save}
      </Button>
    </form>
  );
}
