import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
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
  FEW_CODES,
  MAX_DIGITS,
  MAX_LETTERS,
  REUSE_CHOICES,
  cleanCode,
  codeSteps,
  generateCode,
  normaliseDoorCodes,
  likelyCodes,
  spacedCode,
  type DoorCodes,
} from "@/lib/door-codes";
import { getDoorCodes, saveDoorCodes } from "@/lib/door-codes.functions";

const DIGITS = Array.from({ length: 10 }, (_, i) => String(i));
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const counts = (max: number, from = 0) =>
  Array.from({ length: max - from + 1 }, (_, i) => String(from + i));

function Pick({
  label,
  value,
  options,
  onChange,
  className = "w-20",
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

/**
 * Settings → Check-in and records → Door codes, for one property: what the lock
 * takes, one code or a new one per stay, what to press, and when guests see it.
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
  const [spin, setSpin] = useState(0);
  useEffect(() => {
    if (q.data) setForm(q.data.settings);
  }, [q.data]);

  const next = useMemo(() => (form ? normaliseDoorCodes(form) : null), [form]);
  // A fresh sample whenever the format changes, or on asking.
  const sample = useMemo(() => {
    void spin;
    return next ? generateCode(next, new Set()) : null;
  }, [next, spin]);

  if (q.isLoading || !q.data || !form || !next) return <Skeleton className="h-64 rounded-2xl" />;
  const set = (patch: Partial<DoorCodes>) => setForm((f) => f && { ...f, ...patch });
  const total = likelyCodes(next);
  const hasLetters = next.lettersStart + next.lettersEnd > 0;

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: { propertyId, settings: next as unknown as Record<string, unknown> } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["door-codes", propertyId] }),
        qc.invalidateQueries({ queryKey: ["door-code-jobs"] }),
      ]);
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-5 p-5">
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

      <label className="flex items-center gap-3">
        <Switch checked={form.on} onCheckedChange={(on) => set({ on })} />
        <span className="font-medium">{copy.on}</span>
      </label>

      {form.on ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["per_stay", "static"] as const).map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3 has-[:checked]:border-primary"
              >
                <input
                  type="radio"
                  className="mt-1"
                  checked={form.mode === m}
                  onChange={() => set({ mode: m })}
                />
                <span>
                  <span className="block font-medium">{copy.modes[m][0]}</span>
                  <span className="block text-sm text-muted-foreground">{copy.modes[m][1]}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">{copy.formatTitle}</h3>
            <div className="flex flex-wrap items-end gap-3">
              <Pick
                label={copy.lettersStart}
                value={String(form.lettersStart)}
                options={counts(MAX_LETTERS)}
                onChange={(v) => set({ lettersStart: Number(v) })}
              />
              <Pick
                label={copy.digits}
                value={String(form.digits)}
                options={counts(MAX_DIGITS)}
                onChange={(v) => set({ digits: Number(v) })}
              />
              <Pick
                label={copy.lettersEnd}
                value={String(form.lettersEnd)}
                options={counts(MAX_LETTERS)}
                onChange={(v) => set({ lettersEnd: Number(v) })}
              />
              <Pick
                label={copy.digitFrom}
                value={String(form.digitFrom)}
                options={DIGITS}
                onChange={(v) => set({ digitFrom: Number(v) })}
              />
              <Pick
                label={copy.digitTo}
                value={String(form.digitTo)}
                options={DIGITS}
                onChange={(v) => set({ digitTo: Number(v) })}
              />
              {hasLetters ? (
                <>
                  <Pick
                    label={copy.letterFrom}
                    value={form.letterFrom}
                    options={LETTERS}
                    onChange={(v) => set({ letterFrom: v })}
                  />
                  <Pick
                    label={copy.letterTo}
                    value={form.letterTo}
                    options={LETTERS}
                    onChange={(v) => set({ letterTo: v })}
                  />
                </>
              ) : null}
            </div>

            <div className="rounded-xl bg-muted p-3">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm text-muted-foreground">{copy.sample}</span>
                <span className="font-mono text-xl tracking-wider">
                  {sample ? codeSteps(next, spacedCode(sample)).join(", then ") : "—"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSpin((n) => n + 1)}
                >
                  <RefreshCw /> {copy.another}
                </Button>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.possible(total.toLocaleString("en-GB"))}
              </p>
              {total < FEW_CODES ? (
                <p className="mt-1 flex items-start gap-1.5 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {copy.few}
                </p>
              ) : null}
            </div>
          </div>

          {form.mode === "per_stay" ? (
            <div className="space-y-3">
              <label className="flex items-start gap-3">
                <Switch
                  checked={form.memorable}
                  onCheckedChange={(memorable) => set({ memorable })}
                />
                <span>
                  <span className="block font-medium">{copy.memorable}</span>
                  <span className="block text-sm text-muted-foreground">{copy.memorableHelp}</span>
                </span>
              </label>
              <Pick
                label={copy.reuse}
                className="w-56"
                value={String(form.reuseAfterDays)}
                options={REUSE_CHOICES.map((d) => [String(d), copy.reuseChoice(d)])}
                onChange={(v) => set({ reuseAfterDays: Number(v) })}
              />
              <p className="text-sm text-muted-foreground">{copy.reuseHelp}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="door-static" className="text-xs">
                    {copy.staticCode}
                  </Label>
                  <Input
                    id="door-static"
                    className="w-44 font-mono"
                    value={form.staticCode}
                    onChange={(e) => set({ staticCode: cleanCode(e.target.value) })}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => set({ staticCode: generateCode(next, new Set()) ?? "" })}
                >
                  {copy.makeOne}
                </Button>
              </div>
              {q.data.rooms.length > 1 ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">{copy.roomCodes}</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {q.data.rooms.map((r) => (
                      <div key={r.id} className="space-y-1">
                        <Label htmlFor={`door-${r.id}`} className="text-xs">
                          {r.name}
                        </Label>
                        <Input
                          id={`door-${r.id}`}
                          className="font-mono"
                          placeholder={form.staticCode}
                          value={form.roomCodes[r.id] ?? ""}
                          onChange={(e) =>
                            set({
                              roomCodes: {
                                ...form.roomCodes,
                                [r.id]: cleanCode(e.target.value),
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          )}

          <div className="space-y-3">
            <h3 className="font-medium">{copy.lockTitle}</h3>
            <div className="flex flex-wrap gap-3">
              <div className="space-y-1">
                <Label htmlFor="door-before" className="text-xs">
                  {copy.pressBefore}
                </Label>
                <Input
                  id="door-before"
                  className="w-40"
                  maxLength={24}
                  placeholder={copy.pressBeforeHint}
                  value={form.pressBefore}
                  onChange={(e) => set({ pressBefore: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="door-after" className="text-xs">
                  {copy.pressAfter}
                </Label>
                <Input
                  id="door-after"
                  className="w-40"
                  maxLength={24}
                  placeholder={copy.pressAfterHint}
                  value={form.pressAfter}
                  onChange={(e) => set({ pressAfter: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="door-unlock" className="text-xs">
                  {copy.unlockHow}
                </Label>
                <Textarea
                  id="door-unlock"
                  rows={2}
                  maxLength={500}
                  placeholder={copy.unlockHint}
                  value={form.unlockHow}
                  onChange={(e) => set({ unlockHow: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="door-lock" className="text-xs">
                  {copy.lockHow}
                </Label>
                <Textarea
                  id="door-lock"
                  rows={2}
                  maxLength={500}
                  placeholder={copy.lockHint}
                  value={form.lockHow}
                  onChange={(e) => set({ lockHow: e.target.value })}
                />
              </div>
            </div>
          </div>

          <Pick
            label={copy.reveal}
            className="w-72 max-w-full"
            value={form.reveal}
            options={[
              ["check_in", copy.revealCheckIn],
              ["arrival_day", copy.revealArrival],
            ]}
            onChange={(v) => set({ reveal: v as DoorCodes["reveal"] })}
          />
        </>
      ) : null}
    </section>
  );
}
