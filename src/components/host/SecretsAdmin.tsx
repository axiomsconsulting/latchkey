import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { common, secretsCopy as copy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { SECRET_GROUPS, SECRETS, secretProblem, tidySecret, type SecretDef } from "@/lib/secrets";
import { getSecrets, revealSecretValue, saveSecretValue } from "@/lib/secrets.functions";
import type { SecretRow } from "@/lib/secrets.server";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  app: "bg-emerald-600 text-white",
  lovable: "bg-sky-700 text-white",
  none: "bg-muted text-muted-foreground",
  platform: "bg-secondary text-secondary-foreground",
};

/** Latchkey admin → System: every outside key, where to get it, what it looks like, and its value. */
export function SecretsAdmin() {
  const getFn = useServerFn(getSecrets);
  const q = useQuery({ queryKey: ["admin-secrets"], queryFn: () => getFn() });
  const rows = useMemo(
    () => new Map((q.data?.rows ?? []).map((r) => [r.name, r] as const)),
    [q.data],
  );
  const used = SECRETS.filter((d) => d.edit !== "platform");
  const set = used.filter((d) => rows.get(d.name)?.source !== "none").length;

  return (
    <section className="card-soft space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl">
          <KeyRound className="size-5" aria-hidden /> {copy.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{rebrand(copy.body)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{copy.backupNote}</p>
        {q.data ? (
          <p className="mt-2 text-sm font-medium">{copy.summary(set, used.length - set)}</p>
        ) : null}
      </div>
      {q.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
      {q.error ? <p className="text-sm text-destructive">{common.errorBody}</p> : null}
      {q.data
        ? SECRET_GROUPS.map((g) => {
            const defs = SECRETS.filter((d) => d.group === g.id);
            return (
              <div key={g.id} className="space-y-2">
                <div>
                  <h3 className="font-medium">{g.label}</h3>
                  <p className="text-xs text-muted-foreground">{rebrand(g.hint)}</p>
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {defs.map((d) => (
                    <SecretItem
                      key={d.name}
                      def={d}
                      row={rows.get(d.name) ?? null}
                      onChanged={() => void q.refetch()}
                    />
                  ))}
                </ul>
              </div>
            );
          })
        : null}
    </section>
  );
}

function SecretItem({
  def,
  row,
  onChanged,
}: {
  def: SecretDef;
  row: SecretRow | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const status =
    def.edit === "platform" && row?.source !== "none" ? "platform" : (row?.source ?? "none");
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{rebrand(def.label)}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {def.name}
            {row?.shown ? ` = ${row.shown}` : ""}
          </span>
        </span>
        {row?.problem ? (
          <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-label={copy.looksWrong} />
        ) : null}
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", TONE[status])}>
          {copy.status[status as keyof typeof copy.status]}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <SecretDetails def={def} row={row} onChanged={onChanged} /> : null}
    </li>
  );
}

function SecretDetails({
  def,
  row,
  onChanged,
}: {
  def: SecretDef;
  row: SecretRow | null;
  onChanged: () => void;
}) {
  const saveFn = useServerFn(saveSecretValue);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const tidy = tidySecret(def.name, value);
  const problem = tidy ? secretProblem(def.name, tidy) : null;

  async function save(v: string, force = false) {
    setBusy(true);
    try {
      const r = await saveFn({ data: { name: def.name, value: v, force } });
      toast.success(v.trim() ? copy.saved : copy.cleared);
      if (r.problem) toast.warning(`${copy.looksWrong} ${r.problem}`);
      if (v.trim() && def.afterChange) toast.info(rebrand(def.afterChange));
      setValue("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3 text-sm">
      {row?.shown ? (
        <ValueLine name={def.name} which="current" shown={row.shown} def={def} />
      ) : null}
      {row?.savedAt ? (
        <p className="text-xs text-muted-foreground">
          {copy.savedAt(new Date(row.savedAt).toLocaleString(), row.savedBy)}
        </p>
      ) : null}
      {row?.lovable ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{copy.overrides}</p>
          <ValueLine name={def.name} which="lovable" shown={row.lovable} def={def} />
        </div>
      ) : null}
      {row?.previousAt && def.revealable ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {copy.previous} ({new Date(row.previousAt).toLocaleString()})
          </p>
          <ValueLine name={def.name} which="previous" shown="••••••" def={def} />
        </div>
      ) : null}
      {row?.problem ? (
        <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {copy.looksWrong} {row.problem}
        </p>
      ) : null}

      <dl className="space-y-2">
        <div>
          <dt className="font-medium">{copy.used}</dt>
          <dd className="text-muted-foreground">{rebrand(def.used)}</dd>
        </div>
        <div>
          <dt className="font-medium">{copy.how}</dt>
          <dd>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              {def.steps.map((s, i) => (
                <li key={i}>
                  {rebrand(s.text)}{" "}
                  {s.href ? (
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                    >
                      {new URL(s.href).hostname.replace(/^www\./, "")}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          </dd>
        </div>
        <div>
          <dt className="font-medium">{copy.looks}</dt>
          <dd className="text-muted-foreground">
            {def.looks}
            {def.example ? (
              <>
                {" "}
                {copy.example}: <code className="break-all font-mono text-xs">{def.example}</code>
              </>
            ) : null}
          </dd>
        </div>
        {def.afterChange ? (
          <div>
            <dt className="font-medium">{copy.after}</dt>
            <dd className="text-muted-foreground">{rebrand(def.afterChange)}</dd>
          </div>
        ) : null}
      </dl>

      {def.edit === "app" ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="font-medium">{copy.newValue}</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={def.example ?? copy.paste}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </label>
          {problem ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !tidy}
              onClick={() => void save(value, !!problem)}
              variant={problem ? "outline" : "default"}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {problem ? copy.saveAnyway : copy.save}
            </Button>
            {row?.source === "app" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(rebrand(copy.clearConfirm(def.label)))) void save("");
                }}
              >
                {copy.clear}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {def.edit === "lovable" ? copy.lovableOnly : copy.platformOnly}
        </p>
      )}
    </div>
  );
}

function ValueLine({
  name,
  which,
  shown,
  def,
}: {
  name: string;
  which: "current" | "lovable" | "previous";
  shown: string;
  def: SecretDef;
}) {
  const revealFn = useServerFn(revealSecretValue);
  const masked = def.confidential || which === "previous";
  const [whole, setWhole] = useState<string | null>(masked ? null : shown);
  const [busy, setBusy] = useState(false);

  async function fetchWhole(): Promise<string | null> {
    if (whole !== null) return whole;
    setBusy(true);
    try {
      const r = await revealFn({ data: { name, which } });
      return r.value;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-keep-size>
      <code className="min-w-0 flex-1 break-all rounded-md bg-background px-2 py-1 font-mono text-xs">
        {whole ?? shown}
      </code>
      {def.revealable ? (
        <>
          {masked ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (whole !== null) setWhole(null);
                else setWhole(await fetchWhole());
              }}
              aria-label={whole !== null ? copy.hide : copy.show}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : whole !== null ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            aria-label={copy.copy}
            onClick={async () => {
              const v = await fetchWhole();
              if (v === null) return;
              await navigator.clipboard.writeText(v);
              toast.success(copy.copied);
            }}
          >
            <Copy className="size-4" />
          </Button>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">{copy.neverShown}</span>
      )}
    </div>
  );
}
