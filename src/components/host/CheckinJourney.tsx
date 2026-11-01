import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Lock,
  MonitorSmartphone,
  Printer,
  Route as RouteIcon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { checkinSettings, common } from "@/content/copy";
import {
  PRESETS,
  STEPS,
  effectiveFlow,
  lockOf,
  presetOf,
  visibleSteps,
  type CameraSide,
  type FlowChoices,
  type FlowContext,
  type FlowPolicy,
  type Lane,
  type PresetKey,
  type StepDef,
  type StepId,
  type StepLock,
} from "@/lib/checkin-flow";
import {
  getCheckinFlow,
  getCheckinFlowPolicy,
  saveCheckinFlow,
  saveCheckinFlowPolicy,
} from "@/lib/checkin-flow.functions";
import { cn } from "@/lib/utils";

const copy = checkinSettings.journey;

/** One box: tick, name, what it asks, and why it's fixed (if it is). */
function StepBox({
  def,
  on,
  lock,
  onToggle,
  note,
  children,
}: {
  def: StepDef;
  on: boolean;
  lock: StepLock;
  onToggle?: ((on: boolean) => void) | undefined;
  note?: ReactNode;
  children?: ReactNode;
}) {
  const fixed = lock !== null || !onToggle;
  return (
    <div
      data-tour={`journey-${def.id}`}
      className={cn(
        "relative flex min-w-0 flex-col gap-2 rounded-2xl border-2 p-3 transition-colors md:flex-1 md:basis-44",
        on ? "border-primary bg-primary/5" : "border-dashed border-border bg-background opacity-70",
      )}
    >
      <label className={cn("flex items-start gap-2", !fixed && "cursor-pointer")}>
        {fixed ? (
          <span className="mt-0.5 grid size-4 shrink-0 place-items-center text-primary">
            {on ? <Lock className="size-4" aria-hidden /> : null}
          </span>
        ) : (
          <Checkbox
            className="mt-0.5"
            checked={on}
            onCheckedChange={(v) => onToggle?.(v === true)}
          />
        )}
        <span className="min-w-0">
          <span className="block font-medium leading-snug">{copy.steps[def.id]}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{copy.help[def.id]}</span>
        </span>
      </label>
      {lock ? (
        <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-xs">{copy.locks[lock]}</span>
      ) : null}
      {note ? <div className="text-xs">{note}</div> : null}
      {children}
    </div>
  );
}

/** Boxes in a row joined by arrows; stacked with arrows down on narrow screens. */
function Chain({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  return (
    <div className="flex flex-col items-stretch gap-1 md:flex-row md:flex-wrap md:items-stretch md:gap-1.5">
      {items.map((c, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <span aria-hidden className="grid place-items-center text-muted-foreground">
              <ArrowDown className="size-4 md:hidden" />
              <ArrowRight className="hidden size-4 md:block" />
            </span>
          ) : null}
          {c}
        </Fragment>
      ))}
    </div>
  );
}

function LaneTitle({ lane }: { lane: Lane }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
      {copy.lanes[lane]}
    </p>
  );
}

function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange?: ((v: T) => void) | undefined;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={!onChange}
          onClick={() => onChange?.(o.value)}
          className={cn(
            "min-h-9 rounded-full border px-3 text-xs",
            value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type BoxView = {
  on: (id: StepId) => boolean;
  lock: (id: StepId) => StepLock;
  /** Absent: shown but not changeable here. */
  toggle?: (id: StepId, on: boolean) => void;
  /** The admin's four-way choice instead of a tick. */
  extra?: (id: StepId) => ReactNode;
  note?: (id: StepId) => ReactNode;
};

/** The whole journey drawn as connected boxes: two ways in, the steps for everyone, the fallbacks. */
function JourneyMap({
  steps,
  view,
  choices,
  setChoices,
}: {
  steps: StepDef[];
  view: BoxView;
  choices: FlowChoices;
  setChoices?: ((f: (c: FlowChoices) => FlowChoices) => void) | undefined;
}) {
  const box = (id: StepId, children?: ReactNode) => {
    const def = steps.find((s) => s.id === id);
    if (!def) return null;
    const lock = view.lock(id);
    return (
      <StepBox
        key={id}
        def={def}
        on={view.on(id)}
        lock={lock}
        onToggle={view.toggle && lock === null ? (v) => view.toggle!(id, v) : undefined}
        note={view.note?.(id)}
      >
        {view.extra?.(id)}
        {children}
      </StepBox>
    );
  };
  const lane = (l: Lane) => steps.filter((s) => s.lane === l).map((s) => s.id);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-2xl bg-muted/40 p-3">
          <LaneTitle lane="welcome" />
          <Chain>{lane("welcome").map((id) => box(id))}</Chain>
        </div>
        <div className="rounded-2xl bg-muted/40 p-3">
          <LaneTitle lane="find" />
          <Chain>
            {lane("find").map((id) =>
              id === "find_checkout"
                ? box(
                    id,
                    <Segment
                      label={copy.steps[id]!}
                      value={choices.checkout}
                      options={[
                        { value: "three", label: copy.checkoutThree },
                        { value: "week", label: copy.checkoutWeek },
                      ]}
                      onChange={
                        setChoices ? (v) => setChoices((c) => ({ ...c, checkout: v })) : undefined
                      }
                    />,
                  )
                : box(id),
            )}
          </Chain>
        </div>
      </div>
      <div className="grid place-items-center text-muted-foreground" aria-hidden>
        <ArrowDown className="size-5" />
      </div>
      <div className="rounded-2xl bg-muted/40 p-3">
        <LaneTitle lane="everyone" />
        <Chain>
          {[
            ...lane("everyone").map((id) => box(id)),
            <div
              key="done"
              className="flex min-w-0 items-center gap-2 rounded-2xl bg-success/10 p-3 text-sm font-medium md:basis-32"
            >
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden /> {copy.done}
            </div>,
          ]}
        </Chain>
      </div>
      <div className="rounded-2xl border border-dashed border-border p-3">
        <LaneTitle lane="fallback" />
        <Chain>{lane("fallback").map((id) => box(id))}</Chain>
      </div>
    </div>
  );
}

function Cameras({
  choices,
  setChoices,
}: {
  choices: FlowChoices;
  setChoices?: ((f: (c: FlowChoices) => FlowChoices) => void) | undefined;
}) {
  const sides: Array<{ value: CameraSide; label: string }> = [
    { value: "front", label: copy.front },
    { value: "back", label: copy.back },
    { value: "none", label: copy.noCamera },
  ];
  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="font-medium">{copy.cameras}</p>
      <p className="text-xs text-muted-foreground">{copy.camerasHelp}</p>
      <div className="mt-3 flex flex-wrap gap-6">
        {(["idCamera", "selfieCamera"] as const).map((k) => (
          <div key={k} className="space-y-1">
            <p className="text-sm">{copy[k]}</p>
            <Segment
              label={copy[k]}
              value={choices[k]}
              options={sides}
              onChange={setChoices ? (v) => setChoices((c) => ({ ...c, [k]: v })) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Settings → Guests: this property's check-in journey as connected boxes.
 * Quick and Thorough fill the ticks in one go; "Use Latchkey's journey"
 * follows the starting journey from Latchkey admin again. Steps Latchkey
 * requires are locked on, removed ones aren't shown.
 */
export function CheckinJourney({ property }: { property: { id: string; short_code: string } }) {
  const getFn = useServerFn(getCheckinFlow);
  const saveFn = useServerFn(saveCheckinFlow);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["checkin-flow", property.id],
    queryFn: () => getFn({ data: { propertyId: property.id } }),
  });
  const info = q.data?.available ? q.data : null;
  const policy: FlowPolicy | null = info?.policy ?? null;
  const ctx: FlowContext = { uk: info?.uk ?? false };
  const [draft, setDraft] = useState<FlowChoices | null>(null);
  const [follow, setFollow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!info || !policy) return;
    setDraft(info.own ?? policy.defaults);
    setFollow(info.own === null);
    // A new property, or fresh data after saving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, q.data]);

  const saved = info ? { follow: info.own === null, own: info.own ?? info.policy.defaults } : null;
  const dirty = !!saved && !!draft && changed({ follow, own: draft }, saved);

  if (q.data && !q.data.available)
    return (
      <section className="card-soft p-5">
        <p className="text-sm text-muted-foreground">{copy.unavailable}</p>
      </section>
    );
  if (!info || !policy || !draft) return <section className="card-soft h-64 animate-pulse" />;

  const flow = effectiveFlow(draft, policy, ctx);
  const preset = presetOf(draft, ctx, policy);
  const edit = (f: (c: FlowChoices) => FlowChoices) => {
    setDraft((d) => (d ? f(d) : d));
    setFollow(false);
  };
  const photosBlocked = !info.regulatorConfirmed;
  const reading = info.idReading;

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    try {
      await saveFn({ data: { propertyId: property.id, flow: follow ? null : draft } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["checkin-flow", property.id] }),
        qc.invalidateQueries({ queryKey: ["board"] }),
        qc.invalidateQueries({ queryKey: ["workspace"] }),
      ]);
      toast.success(copy.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const view: BoxView = {
    on: (id) => flow.steps[id],
    lock: (id) => lockOf(id, draft, policy, ctx),
    toggle: (id, on) => edit((c) => ({ ...c, steps: { ...c.steps, [id]: on } })),
    note: (id) => {
      if ((id === "keep_id" || id === "selfie") && flow.steps[id] && photosBlocked)
        return <span className="text-destructive">{copy.needsRegulator}</span>;
      if (id === "lead_id" && flow.steps.lead_id)
        return (
          <span className={reading === "off" ? "text-destructive" : "text-muted-foreground"}>
            {reading === "live"
              ? copy.readingLive
              : reading === "demo"
                ? copy.readingDemo
                : flow.steps.keep_id && !photosBlocked
                  ? copy.readingOff
                  : copy.readingOffNoKeep}
          </span>
        );
      return null;
    },
  };

  return (
    <section className="card-soft p-5" data-tour="checkin-journey">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
            <RouteIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl">{copy.title}</h2>
            <p className="text-sm text-muted-foreground">{copy.body}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/app/print/$propertyId" params={{ propertyId: property.id }}>
              <Printer className="size-4" /> {checkinSettings.printQr}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`/kiosk/${property.short_code}`} target="_blank" rel="noopener noreferrer">
              <MonitorSmartphone className="size-4" /> {checkinSettings.openKiosk}
            </a>
          </Button>
          <SaveButton dirty={dirty} busy={busy} onClick={() => void onSave()} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <Button
            key={k}
            variant={preset === k ? "default" : "outline"}
            size="sm"
            title={k === "quick" ? copy.quickHelp : copy.thoroughHelp}
            onClick={() =>
              edit((c) => ({
                ...PRESETS[k],
                idCamera: c.idCamera,
                selfieCamera: c.selfieCamera,
              }))
            }
          >
            {k === "quick" ? <Sparkles className="size-4" /> : null}
            {k === "quick" ? copy.quick : copy.thorough}
          </Button>
        ))}
        <Button
          variant={follow ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            setDraft(policy.defaults);
            setFollow(true);
          }}
        >
          {copy.followLatchkey}
        </Button>
        <span className="text-xs text-muted-foreground">
          {follow ? copy.followingLatchkey : copy.ownJourney}
        </span>
      </div>

      <div className="mt-4">
        <JourneyMap
          steps={visibleSteps(policy, ctx)}
          view={view}
          choices={draft}
          setChoices={edit}
        />
      </div>
      <div className="mt-4">
        <Cameras choices={draft} setChoices={edit} />
      </div>
    </section>
  );
}

type AdminChoice = "off" | "on" | "required" | "removed";

/**
 * Latchkey admin → Site settings: the journey new properties start with,
 * and the steps required or removed for every property.
 */
export function CheckinJourneyAdmin() {
  const getFn = useServerFn(getCheckinFlowPolicy);
  const saveFn = useServerFn(saveCheckinFlowPolicy);
  const q = useQuery({ queryKey: ["checkin-flow-policy"], queryFn: () => getFn() });
  const [draft, setDraft] = useState<FlowPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setDraft(q.data.policy);
  }, [q.data]);
  const dirty = !!draft && !!q.data && changed(draft, q.data.policy);
  if (!draft) return <section className="card-soft h-64 animate-pulse" />;

  const choiceOf = (id: StepId): AdminChoice =>
    draft.required.includes(id)
      ? "required"
      : draft.removed.includes(id)
        ? "removed"
        : draft.defaults.steps[id]
          ? "on"
          : "off";
  const setChoice = (id: StepId, c: AdminChoice) =>
    setDraft((d) =>
      d
        ? {
            defaults: {
              ...d.defaults,
              steps: { ...d.defaults.steps, [id]: c === "on" || c === "required" },
            },
            required:
              c === "required"
                ? [...d.required.filter((x) => x !== id), id]
                : d.required.filter((x) => x !== id),
            removed:
              c === "removed"
                ? [...d.removed.filter((x) => x !== id), id]
                : d.removed.filter((x) => x !== id),
          }
        : d,
    );

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await saveFn({ data: draft });
      setDraft(res.policy);
      await q.refetch();
      toast.success(copy.adminSaved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const fixed = (id: StepId) => STEPS.find((s) => s.id === id)?.locked;
  const view: BoxView = {
    on: (id) => (fixed(id) ? true : choiceOf(id) === "on" || choiceOf(id) === "required"),
    lock: (id) => {
      const l = fixed(id);
      return l === "always" ? "always" : l === "uk" ? "uk" : null;
    },
    extra: (id) =>
      fixed(id) ? null : (
        <select
          aria-label={copy.steps[id]}
          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"
          value={choiceOf(id)}
          onChange={(e) => setChoice(id, e.target.value as AdminChoice)}
        >
          {(["off", "on", "required", "removed"] as const).map((c) => (
            <option key={c} value={c}>
              {copy.adminChoice[c]}
            </option>
          ))}
        </select>
      ),
  };
  const setDefaults = (f: (c: FlowChoices) => FlowChoices) =>
    setDraft((d) => (d ? { ...d, defaults: f(d.defaults) } : d));

  return (
    <section className="card-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl">{copy.adminTitle}</h2>
          <p className="text-sm text-muted-foreground">{copy.adminBody}</p>
        </div>
        <SaveButton dirty={dirty} busy={busy} onClick={() => void onSave()} />
      </div>
      {!q.data?.available ? (
        <p className="mt-3 text-sm text-destructive">{copy.unavailable}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <Button
            key={k}
            variant="outline"
            size="sm"
            onClick={() => setDefaults(() => ({ ...PRESETS[k] }))}
          >
            {k === "quick" ? copy.quick : copy.thorough}
          </Button>
        ))}
      </div>
      <div className="mt-4">
        <JourneyMap steps={STEPS} view={view} choices={draft.defaults} setChoices={setDefaults} />
      </div>
      <div className="mt-4">
        <Cameras choices={draft.defaults} setChoices={setDefaults} />
      </div>
    </section>
  );
}
