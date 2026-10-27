import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Globe, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { common, domainCopy as copy } from "@/content/copy";
import {
  addHostDomain,
  checkHostDomain,
  listHostDomains,
  removeHostDomain,
  setHostDomainProperty,
} from "@/lib/domains.functions";

function CopyValue({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-secondary"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        })
      }
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{" "}
      {done ? copy.copied : copy.copy}
    </button>
  );
}

/**
 * The owner's own web address for guests (e.g. stay.yourhotel.co.uk): add
 * it, add two DNS records, check. Once connected, guests there see the
 * business's name on every page.
 */
export function CustomDomainSettings({
  hostId,
  isOwner,
  properties,
}: {
  hostId: string;
  isOwner: boolean;
  properties: Array<{ id: string; name: string }>;
}) {
  const listFn = useServerFn(listHostDomains);
  const addFn = useServerFn(addHostDomain);
  const checkFn = useServerFn(checkHostDomain);
  const propFn = useServerFn(setHostDomainProperty);
  const removeFn = useServerFn(removeHostDomain);
  const q = useQuery({
    queryKey: ["host-domains", hostId],
    enabled: isOwner,
    queryFn: () => listFn({ data: { hostId } }),
  });
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      await q.refetch();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Globe className="size-5 text-primary" /> {copy.title}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.help}</p>
      </div>
      {!isOwner ? (
        <p className="text-sm text-muted-foreground">{copy.ownerOnly}</p>
      ) : q.data && !q.data.available ? (
        <p className="text-sm text-muted-foreground">{copy.notReady}</p>
      ) : (
        <>
          {(q.data?.domains ?? []).map((d) => (
            <article key={d.domain} className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono">{d.domain}</span>
                <Badge variant={d.live ? "default" : "secondary"}>
                  {d.live ? copy.live : d.verified ? copy.waitingLive : copy.waitingProof}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(
                      `rm-${d.domain}`,
                      () => removeFn({ data: { hostId, domain: d.domain } }),
                      copy.removed,
                    )
                  }
                >
                  <Trash2 className="size-4" /> {copy.remove}
                </Button>
              </div>
              {properties.length > 1 ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{copy.opens}</span>
                  <Select
                    value={d.propertyId ?? "first"}
                    onValueChange={(v) =>
                      void act(`p-${d.domain}`, () =>
                        propFn({
                          data: { hostId, domain: d.domain, propertyId: v === "first" ? null : v },
                        }),
                      )
                    }
                  >
                    <SelectTrigger className="h-9 w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">{copy.firstProperty}</SelectItem>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {!d.verified ? (
                <div className="space-y-2 text-sm">
                  <p>{copy.step1}</p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">{copy.type}</th>
                          <th className="px-3 py-2 font-medium">{copy.host}</th>
                          <th className="px-3 py-2 font-medium">{copy.value}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {d.records.map((r) => (
                          <tr key={r.type}>
                            <td className="px-3 py-2 font-medium">{r.type}</td>
                            <td className="px-3 py-2 font-mono">
                              {r.name} <CopyValue value={r.name} />
                            </td>
                            <td className="px-3 py-2 font-mono">
                              {r.value} <CopyValue value={r.value} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-muted-foreground">{copy.step2}</p>
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void act(`c-${d.domain}`, async () => {
                        const r = await checkFn({ data: { hostId, domain: d.domain } });
                        toast[r.verified ? "success" : "message"](
                          r.verified ? copy.proved : copy.notYet,
                        );
                      })
                    }
                  >
                    {busy === `c-${d.domain}` ? <Loader2 className="size-4 animate-spin" /> : null}{" "}
                    {busy === `c-${d.domain}` ? copy.checking : copy.check}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!domain.trim()) return;
              void act(
                "add",
                () =>
                  addFn({ data: { hostId, domain, propertyId: null } }).then(() => setDomain("")),
                copy.added,
              );
            }}
          >
            <Input
              className="h-11 min-w-0 flex-1 font-mono"
              placeholder={copy.placeholder}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
            />
            <Button type="submit" className="h-11" disabled={busy !== null || !domain.trim()}>
              {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : null} {copy.add}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
