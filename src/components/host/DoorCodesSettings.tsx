import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Lock, RefreshCw, TriangleAlert } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { common, doorCodesCopy as copy } from "@/content/copy";
import {
  DOOR_KEYS,
  FEW_CODES,
  FORMAT_PRESETS,
  MAX_DIGITS,
  MAX_LETTERS,
  REUSE_CHOICES,
  cleanCode,
  codeSteps,
  generateCode,
  likelyCodes,
  normaliseDoorCodes,
  presetOfFormat,
  spacedCode,
  type Door,
  type DoorCodes,
  type DoorKey,
} from "@/lib/door-codes";
import { getDoorCodes, saveDoorCodes } from "@/lib/door-codes.functions";
import { cn } from "@/lib/utils";

const DIGITS = Array.from({ length: 10 }, (_, i) => String(i));
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const counts = (max: number) => Array.from({ length: max + 1 }, (_, i) => String(i));
const MODES: Door["mode"][] = ["per_stay", "static", "off"];

function Pick({
  label,
  value,
  options,
  onChange,
  className = "w-24",
}: {
  label: string;
  value: string;
  options: Array<string | [string, string]>;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={`h-10 ${className}`} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => {
            const [v, text] = typeof o === "string" ? [o, o] : o;
            return (
              <SelectItem key={v} value={v}>
                {text}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** One door: how it opens and, if by code, what the lock takes and how it's used. */
function DoorSetup({
  k,
  door,
  set,
  rooms,
  explainMemorable,
}: {
  k: DoorKey;
  door: Door;
  set: (patch: Partial<Door>) => void;
  rooms: Array<{ id: string; name: string }>;
  /** Said once: on the first door that takes a code. */
  explainMemorable: boolean;
}) {
  const [own, setOwn] = useState(false);
  const [spin, setSpin] = useState(0);
  const preset = presetOfFormat(door);
  const showOwn = own || !preset;
  const sample = useMemo(() => {
    void spin;
    return generateCode(door, new Set());
    // Only when what it depends on changes, or on asking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    door.lettersStart,
    door.digits,
    door.lettersEnd,
    door.digitFrom,
    door.digitTo,
    door.letterFrom,
    door.letterTo,
    door.memorable,
    spin,
  ]);
  const fixed = door.mode === "static";
  // The real code once there is one; otherwise what one could look like.
  const shown = fixed
    ? (k === "front" ? door.staticCode : Object.values(door.roomCodes)[0]) || sample
    : sample;
  const total = likelyCodes(door);
  const hasLetters = door.lettersStart + door.lettersEnd > 0;
  const make = () => generateCode(door, new Set());
  const taken = () => new Set(Object.values(door.roomCodes));

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div>
        <h3 className="font-medium">{copy.doors[k]}</h3>
        <p className="text-sm text-muted-foreground">{copy.doorHelp[k]}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <label
            key={m}
            className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3 has-[:checked]:border-primary"
          >
            <input
              type="radio"
              name={`door-mode-${k}`}
              className="mt-1"
              checked={door.mode === m}
              onChange={() => set({ mode: m })}
            />
            <span>
              <span className="block text-sm font-medium">{copy.modes[m]![0]}</span>
              {k === "front" ? (
                <span className="block text-xs text-muted-foreground">{copy.modes[m]![1]}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      {door.mode === "off" ? (
        <Field id={`door-key-${k}`} label={copy.keyNote}>
          <Textarea
            id={`door-key-${k}`}
            rows={2}
            maxLength={300}
            placeholder={copy.keyNoteHint}
            value={door.keyNote}
            onChange={(e) => set({ keyNote: e.target.value })}
          />
        </Field>
      ) : (
        <>
          <div className="space-y-3">
            <h4 className="text-sm font-medium">{copy.formatTitle}</h4>
            <div className="flex flex-wrap gap-2">
              {FORMAT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setOwn(false);
                    set({ ...p.format, memorable: door.memorable });
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-left text-sm",
                    !showOwn && preset === p.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-secondary",
                  )}
                >
                  <span className="block">{copy.presets[p.id]![0]}</span>
                  <span className="block font-mono text-xs opacity-80">
                    {copy.presets[p.id]![1]}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOwn(true)}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-sm",
                  showOwn
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-secondary",
                )}
              >
                {copy.ownFormat}
              </button>
            </div>
            {showOwn ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-3">
                  <Pick
                    label={copy.lettersStart}
                    value={String(door.lettersStart)}
                    options={counts(MAX_LETTERS)}
                    onChange={(v) => set({ lettersStart: Number(v) })}
                  />
                  <Pick
                    label={copy.digits}
                    value={String(door.digits)}
                    options={counts(MAX_DIGITS)}
                    onChange={(v) => set({ digits: Number(v) })}
                  />
                  <Pick
                    label={copy.lettersEnd}
                    value={String(door.lettersEnd)}
                    options={counts(MAX_LETTERS)}
                    onChange={(v) => set({ lettersEnd: Number(v) })}
                  />
                  <Pick
                    label={copy.digitFrom}
                    className="w-40"
                    value={String(door.digitFrom)}
                    options={DIGITS}
                    onChange={(v) => set({ digitFrom: Number(v) })}
                  />
                  <Pick
                    label={copy.digitTo}
                    className="w-40"
                    value={String(door.digitTo)}
                    options={DIGITS}
                    onChange={(v) => set({ digitTo: Number(v) })}
                  />
                  {hasLetters ? (
                    <>
                      <Pick
                        label={copy.letterFrom}
                        value={door.letterFrom}
                        options={LETTERS}
                        onChange={(v) => set({ letterFrom: v })}
                      />
                      <Pick
                        label={copy.letterTo}
                        value={door.letterTo}
                        options={LETTERS}
                        onChange={(v) => set({ letterTo: v })}
                      />
                    </>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{copy.ownFormatHelp}</p>
              </div>
            ) : null}
            <label className="flex items-start gap-3">
              <Switch
                checked={door.memorable}
                onCheckedChange={(memorable) => set({ memorable })}
              />
              <span>
                <span className="block text-sm font-medium">{copy.memorable}</span>
                {explainMemorable ? (
                  <span className="block text-xs text-muted-foreground">{copy.memorableHelp}</span>
                ) : null}
              </span>
            </label>
          </div>

          {fixed ? (
            <div className="space-y-3">
              {k === "front" ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Field id="door-static" label={copy.staticCode}>
                    <Input
                      id="door-static"
                      className="w-44 font-mono"
                      disabled={door.locked}
                      value={door.staticCode}
                      onChange={(e) => set({ staticCode: cleanCode(e.target.value) })}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={door.locked}
                    onClick={() => set({ staticCode: make() ?? "" })}
                  >
                    {door.staticCode ? copy.remake : copy.make}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-medium">{copy.roomCodesTitle}</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={door.locked}
                      onClick={() => {
                        const codes = { ...door.roomCodes };
                        const used = taken();
                        for (const r of rooms) {
                          if (codes[r.id]) continue;
                          const c = generateCode(door, used);
                          if (c) {
                            codes[r.id] = c;
                            used.add(c);
                          }
                        }
                        set({ roomCodes: codes });
                      }}
                    >
                      {copy.makeAll}
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rooms.map((r) => (
                      <Field key={r.id} id={`door-${r.id}`} label={r.name}>
                        <div className="flex gap-1">
                          <Input
                            id={`door-${r.id}`}
                            className="font-mono"
                            disabled={door.locked}
                            value={door.roomCodes[r.id] ?? ""}
                            onChange={(e) =>
                              set({
                                roomCodes: {
                                  ...door.roomCodes,
                                  [r.id]: cleanCode(e.target.value),
                                },
                              })
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={door.locked}
                            aria-label={`${copy.remake}: ${r.name}`}
                            onClick={() =>
                              set({
                                roomCodes: {
                                  ...door.roomCodes,
                                  [r.id]: generateCode(door, taken()) ?? "",
                                },
                              })
                            }
                          >
                            <RefreshCw />
                          </Button>
                        </div>
                      </Field>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-start gap-3">
                <Switch checked={door.locked} onCheckedChange={(locked) => set({ locked })} />
                <span>
                  <span className="flex items-center gap-1 text-sm font-medium">
                    <Lock className="size-3.5" aria-hidden />
                    {k === "front" ? copy.lock : copy.lockRooms}
                  </span>
                  <span className="block text-xs text-muted-foreground">{copy.lockHelp}</span>
                </span>
              </label>
            </div>
          ) : null}

          <div className="space-y-3">
            <h4 className="text-sm font-medium">{copy.lockTitle}</h4>
            <div className="flex flex-wrap gap-3">
              <Field id={`door-before-${k}`} label={copy.pressBefore}>
                <Input
                  id={`door-before-${k}`}
                  className="w-44"
                  maxLength={24}
                  placeholder={copy.pressBeforeHint}
                  value={door.pressBefore}
                  onChange={(e) => set({ pressBefore: e.target.value })}
                />
              </Field>
              <Field id={`door-after-${k}`} label={copy.pressAfter}>
                <Input
                  id={`door-after-${k}`}
                  className="w-44"
                  maxLength={24}
                  placeholder={copy.pressAfterHint}
                  value={door.pressAfter}
                  onChange={(e) => set({ pressAfter: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={`door-unlock-${k}`} label={copy.unlockHow}>
                <Textarea
                  id={`door-unlock-${k}`}
                  rows={2}
                  maxLength={500}
                  placeholder={copy.unlockHint}
                  value={door.unlockHow}
                  onChange={(e) => set({ unlockHow: e.target.value })}
                />
              </Field>
              <Field id={`door-lock-${k}`} label={copy.lockHow}>
                <Textarea
                  id={`door-lock-${k}`}
                  rows={2}
                  maxLength={500}
                  placeholder={copy.lockHint}
                  value={door.lockHow}
                  onChange={(e) => set({ lockHow: e.target.value })}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-xl bg-muted p-3">
            <p className="text-sm text-muted-foreground">{copy.sample}</p>
            <p className="mt-1 font-mono text-lg">
              {shown ? codeSteps(door, spacedCode(shown)).join(", then ") : "—"}
            </p>
            {!fixed ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2"
                  onClick={() => setSpin((n) => n + 1)}
                >
                  <RefreshCw /> {copy.another}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {copy.possible(total.toLocaleString("en-GB"))}
                </p>
                {total < FEW_CODES ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                    {copy.few}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Settings → Check-in and records → Door codes, for one property: for each door,
 * a new code per stay, one fixed code or a key; then what the lock takes, what to
 * press, and when guests see it.
 */
export function DoorCodesSettings({ propertyId }: { propertyId: string }) {
  const fetchFn = useServerFn(getDoorCodes);
  const saveFn = useServerFn(saveDoorCodes);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["door-codes", propertyId],
    queryFn: () => fetchFn({ data: { propertyId } }),
  });
  const [form, setForm] = useState<DoorCodes | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setForm(q.data.settings);
  }, [q.data]);

  const next = useMemo(() => (form ? normaliseDoorCodes(form) : null), [form]);
  if (q.isLoading || !q.data || !form || !next) return <Skeleton className="h-64 rounded-2xl" />;
  const perStay = DOOR_KEYS.some((k) => form[k].mode === "per_stay");
  const anyCode = DOOR_KEYS.some((k) => form[k].mode !== "off");

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId, settings: next as unknown as Record<string, unknown> } });
      await Promise.all(
        [["door-codes", propertyId], ["door-code-jobs"], ["stay-door-codes"], ["board"]].map(
          (queryKey) => qc.invalidateQueries({ queryKey }),
        ),
      );
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="flex items-center gap-2 text-lg">
            <KeyRound className="size-5 text-accent" aria-hidden /> {copy.title}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <SaveButton
          dirty={changed(next, q.data.settings)}
          busy={busy}
          onClick={() => void save()}
        />
      </div>
      {!q.data.available ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
      ) : null}

      {DOOR_KEYS.map((k) => (
        <DoorSetup
          key={k}
          k={k}
          door={form[k]}
          rooms={q.data.rooms}
          explainMemorable={k === "front" || form.front.mode === "off"}
          set={(patch) => setForm((f) => f && { ...f, [k]: { ...f[k], ...patch } })}
        />
      ))}

      {anyCode ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="font-medium">{copy.sharedTitle}</h3>
          <div className="space-y-1">
            <Pick
              label={copy.reveal}
              className="w-72 max-w-full"
              value={form.reveal}
              options={[
                ["check_in", copy.revealCheckIn],
                ["arrival_day", copy.revealArrival],
              ]}
              onChange={(v) => setForm((f) => f && { ...f, reveal: v as DoorCodes["reveal"] })}
            />
            <p className="text-xs text-muted-foreground">{copy.revealHelp}</p>
          </div>
          {perStay ? (
            <div className="space-y-1">
              <Pick
                label={copy.reuse}
                className="w-56"
                value={String(form.reuseAfterDays)}
                options={REUSE_CHOICES.map((d) => [String(d), copy.reuseChoice(d)])}
                onChange={(v) => setForm((f) => f && { ...f, reuseAfterDays: Number(v) })}
              />
              <p className="text-xs text-muted-foreground">{copy.reuseHelp}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
