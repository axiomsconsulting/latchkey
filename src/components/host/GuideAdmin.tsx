import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, HardDrive, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { common, driveAdminCopy, starterAdminCopy } from "@/content/copy";
import {
  driveConnectUrl,
  driveDisconnect,
  driveStatus,
  syncPrivateQueue,
} from "@/lib/attachments.functions";
import { SECTIONS } from "@/lib/guide";
import { getStarterSettings, setStarterSection } from "@/lib/site.functions";

/** Super admin: which starter sections new hosts begin their stay guide with. */
export function StarterSectionsAdmin() {
  const fetchFn = useServerFn(getStarterSettings);
  const setFn = useServerFn(setStarterSection);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["starter-sections"], queryFn: () => fetchFn() });
  const removed = q.data?.removed ?? {};
  return (
    <section className="card-soft space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg">
          <BookOpen className="size-5 text-primary" /> {starterAdminCopy.title}
        </h2>
        <p className="text-sm text-muted-foreground">{starterAdminCopy.help}</p>
      </div>
      {q.data && !q.data.available ? (
        <p className="text-sm text-muted-foreground">{starterAdminCopy.notReady}</p>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {SECTIONS.map((s) => {
          const offered = !removed[s.key];
          return (
            <li key={s.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  {s.title} <Badge variant="secondary">{starterAdminCopy.badge}</Badge>
                </span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <label className="flex items-center gap-2 text-sm">
                {starterAdminCopy.offered}
                <Switch
                  checked={offered}
                  disabled={!q.data?.available}
                  onCheckedChange={(v) =>
                    void setFn({ data: { key: s.key, offered: v } })
                      .then(() => qc.invalidateQueries({ queryKey: ["starter-sections"] }))
                      .then(() => toast.success(starterAdminCopy.saved))
                      .catch((e: unknown) =>
                        toast.error(e instanceof Error ? e.message : common.errorBody),
                      )
                  }
                />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Super admin: the Google Drive guide attachments are kept in. */
export function DriveAdmin() {
  const statusFn = useServerFn(driveStatus);
  const connectFn = useServerFn(driveConnectUrl);
  const disconnectFn = useServerFn(driveDisconnect);
  const syncFn = useServerFn(syncPrivateQueue);
  const [syncing, setSyncing] = useState(false);
  const q = useQuery({ queryKey: ["drive-status"], queryFn: () => statusFn() });
  const search = useSearch({ strict: false }) as { drive?: string };
  const navigate = useNavigate();
  useEffect(() => {
    const r = search.drive;
    if (!r) return;
    const msg = driveAdminCopy.results[r];
    if (msg) (r === "connected" ? toast.success : toast.error)(msg);
    void q.refetch();
    void navigate({ to: ".", search: {} as never, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.drive]);
  const s = q.data;
  return (
    <section className="card-soft space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg">
          <HardDrive className="size-5 text-primary" /> {driveAdminCopy.title}
        </h2>
        <p className="text-sm text-muted-foreground">{driveAdminCopy.help}</p>
      </div>
      {q.isLoading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : null}
      {s ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={s.connected ? "default" : "outline"}>
              {s.connected && s.email
                ? driveAdminCopy.connected(s.email)
                : s.connected
                  ? driveAdminCopy.connected("Google")
                  : driveAdminCopy.notConnected}
            </Badge>
            <Button
              size="sm"
              disabled={!s.configured}
              onClick={() =>
                void connectFn()
                  .then((r) => window.location.assign(r.url))
                  .catch((e: unknown) =>
                    toast.error(e instanceof Error ? e.message : common.errorBody),
                  )
              }
            >
              {s.connected ? driveAdminCopy.reconnect : driveAdminCopy.connect}
            </Button>
            {s.connected ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() =>
                  void disconnectFn()
                    .then(() => q.refetch())
                    .then(() => toast.success(driveAdminCopy.disconnected))
                }
              >
                {driveAdminCopy.disconnect}
              </Button>
            ) : null}
          </div>
          {!s.configured ? (
            <p className="text-sm text-destructive">{driveAdminCopy.missingSecrets}</p>
          ) : null}
          {s.queue ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
              <span className={s.queue.waiting ? "text-destructive" : "text-muted-foreground"}>
                {s.queue.waiting
                  ? driveAdminCopy.queueWaiting(s.queue.waiting)
                  : driveAdminCopy.queueEmpty}
              </span>
              {s.queue.lastError ? (
                <span className="text-xs text-muted-foreground">{s.queue.lastError}</span>
              ) : null}
              {s.queue.waiting ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={syncing || !s.connected}
                  onClick={() => {
                    setSyncing(true);
                    void syncFn()
                      .then((r) => toast.success(driveAdminCopy.queueMoved(r.moved, r.waiting)))
                      .catch((e: unknown) =>
                        toast.error(e instanceof Error ? e.message : common.errorBody),
                      )
                      .finally(() => {
                        setSyncing(false);
                        void q.refetch();
                      });
                  }}
                >
                  {syncing ? <Loader2 className="size-4 animate-spin" /> : null}{" "}
                  {driveAdminCopy.queueMove}
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{driveAdminCopy.scopeNote}</p>
          <details className="rounded-xl border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">{driveAdminCopy.setupTitle}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              {driveAdminCopy.setup.map((step, i) => (
                <li key={i}>
                  {step}
                  {i === 2 ? (
                    <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                      {s.callback}
                    </code>
                  ) : null}
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : null}
    </section>
  );
}
