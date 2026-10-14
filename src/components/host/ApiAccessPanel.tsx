import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { apiCopy as copy, common } from "@/content/copy";
import { createApiKey, getApiAccess, revokeApiKey } from "@/lib/apikeys.functions";
import { formatUkDate } from "@/lib/dates";

/** Settings → API & MCP: allowance, keys and where to start. */
export function ApiAccessPanel({ hostId, canWrite }: { hostId: string; canWrite: boolean }) {
  const fetchAccess = useServerFn(getApiAccess);
  const make = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["api-access", hostId], queryFn: () => fetchAccess({ data: { hostId } }) });
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const d = q.data;
  if (!d?.available) return null;
  const live = d.keys.filter((k) => !k.revoked_at);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { key } = await make({ data: { hostId, name, write } });
      setFresh(key);
      setName("");
      setWrite(false);
      await qc.invalidateQueries({ queryKey: ["api-access", hostId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <KeyRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/developers">
            <BookOpen className="size-4" /> {copy.docs}
          </Link>
        </Button>
      </div>

      {!d.allowed ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted p-3 text-sm">
          <span className="flex-1">{d.published ? copy.notOnPlan : copy.notPublished}</span>
          {d.published ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/app/billing">{copy.toBilling}</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1">
          <Progress value={Math.min(100, (d.used / Math.max(1, d.allowance)) * 100)} />
          <p className="text-sm text-muted-foreground">{copy.usage(d.used, d.allowance)}</p>
        </div>
      )}

      {fresh ? (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">{copy.keyShownOnce}</p>
          <div className="flex gap-2">
            <Input readOnly value={fresh} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard?.writeText(fresh).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? copy.copied : copy.copy}
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="font-medium">{copy.keysTitle}</h3>
        {live.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{copy.noKeys}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {live.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{k.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{k.prefix}…</span>
                </span>
                <Badge variant="outline">{k.scopes.includes("write") ? copy.readWrite : copy.readOnly}</Badge>
                <span className="text-xs text-muted-foreground">
                  {k.last_used_at ? copy.lastUsed(formatUkDate(k.last_used_at.slice(0, 10))) : copy.neverUsed}
                </span>
                {canWrite ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() =>
                      void revoke({ data: { hostId, keyId: k.id } })
                        .then(() => qc.invalidateQueries({ queryKey: ["api-access", hostId] }))
                        .then(() => toast.success(copy.revokedToast))
                    }
                  >
                    {copy.revoke}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite && d.allowed ? (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1">
            <Label htmlFor="key-name">{copy.keyName}</Label>
            <Input id="key-name" required maxLength={60} placeholder={copy.keyNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" className="self-end" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} {copy.makeKey}
          </Button>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Switch checked={write} onCheckedChange={setWrite} /> {copy.canWrite}
          </label>
        </form>
      ) : null}
    </section>
  );
}
