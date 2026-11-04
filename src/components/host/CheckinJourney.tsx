import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  BookUser,
  CalendarDays,
  Camera,
  CaseSensitive,
  CheckCircle2,
  ChevronDown,
  Hand,
  Hash,
  IdCard,
  Lock,
  MessageCircle,
  MonitorSmartphone,
  Printer,
  Route as RouteIcon,
  ScanLine,
  Sparkles,
  UserCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { SaveButton, changed } from "@/components/host/SaveButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoTip } from "@/components/host/InfoTip";
import {
  checkinSettings,
  common,
  roomRulesCopy,
  roomRulesHead,
  roomRulesIntro,
  roomRulesTitle,
} from "@/content/copy";
import { ROOM_RULES } from "@/lib/room-allocation";
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

const STEP_ICONS: Record<StepId, typeof Lock> = {
  welcome_go: Hand,
  find_id: ScanLine,
  find_letter: CaseSensitive,
  find_checkout: CalendarDays,
  find_confirm: UserCheck,
  party: Users,
  lead_id: IdCard,
  keep_id: Archive,
  every_adult_id: UsersRound,
  selfie: Camera,
  register: BookUser,
  last4: Hash,
  self_declare: MessageCircle,
};

/**
 * One step on the branch: its icon, tick and name. Tapping the name opens what it
 * does, so the list stays short enough to read in one go.
 */
function StepBox({
  def,
  on,
  lock,
  onToggle,
  note,
  nested,
  children,
}: {
  def: StepDef;
  on: boolean;
  lock: StepLock;
  onToggle?: ((on: boolean) => void) | undefined;
  note?: ReactNode;
  /** Belongs to the step above. */
  nested?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fixed = lock !== null || !onToggle;
  const Icon = STEP_ICONS[def.id];
  return (
    <li
      data-tour={`journey-${def.id}`}
      className={cn(
        "relative before:absolute before:left-[-1rem] before:top-[1.35rem] before:h-0.5 before:w-3 before:bg-border",
        nested && "ml-5",
      )}
    >
      <div
        className={cn(
          "rounded-xl border p-2 transition-colors",
          on ? "border-primary/40 bg-primary/5" : "border-dashed border-border opacity-70",
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" aria-hidden />
          {fixed ? (
            <span className="grid size-4 shrink-0 place-items-center text-primary">
              {on ? <Lock className="size-3.5" aria-hidden /> : null}
            </span>
          ) : (
            <Checkbox
              checked={on}
              aria-label={copy.steps[def.id]}
              onCheckedChange={(v) => onToggle?.(v === true)}
            />
          )}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-7 min-w-0 flex-1 items-center gap-1 text-left text-sm font-medium"
          >
            <span className="min-w-0">{copy.steps[def.id]}</span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {lock ? (
            <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] sm:inline">
              {copy.locks[lock]}
            </span>
          ) : null}
        </div>
        {open ? (
          <p className="mt-1.5 pl-12 text-xs text-muted-foreground">
            {copy.help[def.id]}
            {lock ? <span className="sm:hidden"> {copy.locks[lock]}.</span> : null}
          </p>
        ) : null}
        {note ? <div className="mt-1.5 pl-12 text-xs">{note}</div> : null}
        {children ? <div className="mt-1.5 pl-12">{children}</div> : null}
      </div>
    </li>
  );
}

/** A group's steps hanging off one line, like branches. */
function Branch({ children }: { children: ReactNode }) {
  return <ul className="ml-3 space-y-1.5 border-l-2 border-border pl-4">{children}</ul>;
}

function LaneTitle({ lane }: { lane: Lane }) {
  return <p className="mb-1.5 text-sm font-semibold">{copy.lanes[lane]}</p>;
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

/** The whole journey as a tree: two ways in, the steps for everyone, the fallbacks. */
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
  const box = (id: StepId, nested: boolean, children?: ReactNode) => {
    const def = steps.find((s) => s.id === id);
    if (!def) return null;
    const lock = view.lock(id);
    return (
      <StepBox
        key={id}
        def={def}
        on={view.on(id)}
        lock={lock}
        nested={nested}
        onToggle={view.toggle && lock === null ? (v) => view.toggle!(id, v) : undefined}
        note={view.note?.(id)}
      >
        {view.extra?.(id)}
        {children}
      </StepBox>
    );
  };
  const lane = (l: Lane) => {
    const list = steps.filter((s) => s.lane === l);
    return list.map((s, i) => {
      // Goes under the step it depends on, when that's the one above it.
      const nested = !!s.needs && list[i - 1]?.id === s.needs;
      return box(
        s.id,
        nested,
        s.id === "find_checkout" ? (
          <Segment
            label={copy.steps[s.id]!}
            value={choices.checkout}
            options={[
              { value: "three", label: copy.checkoutThree },
              { value: "week", label: copy.checkoutWeek },
            ]}
            onChange={setChoices ? (v) => setChoices((c) => ({ ...c, checkout: v })) : undefined}
          />
        ) : undefined,
      );
    });
  };
  return (
    <div className="space-y-4">
      {(["welcome", "find", "everyone"] as const).map((l) => (
        <div key={l}>
          <LaneTitle lane={l} />
          <Branch>{lane(l)}</Branch>
        </div>
      ))}
      <p className="flex items-center gap-2 pl-1 text-sm font-medium">
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden /> {copy.done}
      </p>
      <div>
        <LaneTitle lane="fallback" />
        <Branch>{lane("fallback")}</Branch>
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
 * Settings → Check-in: this property's check-in journey as a tree of steps.
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
            <h2 className="flex items-center gap-1 text-xl">
              {copy.title}
              <InfoTip label={copy.title}>{copy.info}</InfoTip>
            </h2>
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
      <RoomRules />
    </section>
  );
}

/** Folded under the journey: what happens to the room once a guest has given their ID. */
export function RoomRules() {
  return (
    <details id="room-rules" className="mt-4 rounded-xl border border-border p-3">
      <summary className="cursor-pointer font-medium">{roomRulesTitle}</summary>
      <p className="mt-2 text-sm text-muted-foreground">{roomRulesIntro}</p>
      <div className="mt-3 divide-y divide-border">
        <div className="hidden gap-4 pb-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-2">
          <span>{roomRulesHead[0]}</span>
          <span>{roomRulesHead[1]}</span>
        </div>
        {ROOM_RULES.map((r) => (
          <div key={r.id} className="grid gap-x-4 gap-y-0.5 py-2 text-sm sm:grid-cols-2">
            <span>{roomRulesCopy[r.id][0]}</span>
            <span className="text-muted-foreground">{roomRulesCopy[r.id][1]}</span>
          </div>
        ))}
      </div>
    </details>
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
