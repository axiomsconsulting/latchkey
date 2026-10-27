import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { InstallApp } from "@/components/InstallApp";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { common, notifyCopy as copy } from "@/content/copy";
import {
  createTelegramLink,
  getNotifySettings,
  removePushSubscription,
  removeTelegramLink,
  saveNotifyPrefs,
  savePushSubscription,
  sendTestAlert,
} from "@/lib/notify.functions";
import type { NotifyPrefs } from "@/lib/notify";
import { pushState, turnOffPush, turnOnPush, type PushState } from "@/lib/push-client";

/** Settings: install the app, and choose where alerts go. */
export function AlertSettings({ hostId, canWrite }: { hostId: string; canWrite: boolean }) {
  const fetchFn = useServerFn(getNotifySettings);
  const saveFn = useServerFn(saveNotifyPrefs);
  const savePush = useServerFn(savePushSubscription);
  const removePush = useServerFn(removePushSubscription);
  const linkTg = useServerFn(createTelegramLink);
  const unlinkTg = useServerFn(removeTelegramLink);
  const testFn = useServerFn(sendTestAlert);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notify-settings", hostId],
    queryFn: () => fetchFn({ data: { hostId } }),
  });
  const [device, setDevice] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void pushState().then(setDevice);
  }, []);

  const d = q.data;
  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!d?.available) return null;
  const prefs = d.prefs;

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["notify-settings", hostId] });
      if (done) toast.success(done);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(
        m === "needs-app"
          ? copy.pushNeedsApp
          : m === "blocked"
            ? copy.pushBlocked
            : m || common.errorBody,
      );
    } finally {
      setBusy(null);
      setDevice(await pushState());
    }
  }
  const setPref = (patch: Partial<NotifyPrefs>) =>
    run("prefs", () => saveFn({ data: { hostId, prefs: { ...prefs, ...patch } } }), copy.saved);

  const ready = {
    push: d.push.ready,
    telegram: d.telegram.ready,
    email: !!d.email.address,
    sms: d.sms.ready && !!d.sms.phone,
  };
  const why: Record<string, string | null> = {
    push: d.push.ready ? null : copy.notReady,
    telegram: d.telegram.ready ? null : copy.notReady,
    email: !d.email.address ? copy.noEmail : !d.email.live ? copy.emailDemo : null,
    sms: !d.sms.ready ? copy.notReady : !d.sms.phone ? copy.noPhone : null,
  };

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <BellRing className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/60 p-3 text-sm">
        <span className="min-w-0 flex-1">{copy.install}</span>
        <InstallApp size="sm" />
      </div>

      <ul className="divide-y divide-border rounded-2xl border border-border">
        {(["push", "telegram", "email", "sms"] as const).map((ch) => {
          const [name, about] = copy.channels[ch]!;
          return (
            <li key={ch} className="space-y-2 p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{why[ch] ?? about}</p>
                </div>
                <Switch
                  checked={prefs[ch] && ready[ch]}
                  disabled={!canWrite || !ready[ch] || busy !== null}
                  onCheckedChange={(v) => void setPref({ [ch]: v })}
                  aria-label={name}
                />
              </div>

              {ch === "push" && d.push.ready && prefs.push ? (
                <div className="flex flex-wrap items-center gap-2 pl-1 text-sm">
                  <span className="text-muted-foreground">{copy.thisDevice}:</span>
                  {device === "on" ? (
                    <>
                      <span className="font-medium text-success">{copy.on}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() =>
                          void run(
                            "push",
                            () => turnOffPush((endpoint) => removePush({ data: { endpoint } })),
                            copy.pushOff,
                          )
                        }
                      >
                        {copy.turnOff}
                      </Button>
                    </>
                  ) : device === "off" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          "push",
                          () =>
                            turnOnPush(d.push.publicKey!, (endpoint, dev) =>
                              savePush({ data: { hostId, endpoint, device: dev } }),
                            ),
                          copy.pushOn,
                        )
                      }
                    >
                      {busy === "push" ? <Loader2 className="size-4 animate-spin" /> : null}{" "}
                      {copy.turnOn}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {device === "blocked"
                        ? copy.pushBlocked
                        : device === "ios-install"
                          ? copy.pushIos
                          : copy.pushNeedsApp}
                    </span>
                  )}
                  {d.devices.length ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {copy.devices(d.devices.length)}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {ch === "push" && d.devices.length ? (
                <ul className="pl-1 text-xs text-muted-foreground">
                  {d.devices.map((dev) => (
                    <li key={dev.id} className="flex items-center gap-2">
                      <span className="flex-1">{dev.device ?? "Device"}</span>
                      {canWrite || dev.user_id === d.me ? (
                        <button
                          type="button"
                          className="underline-offset-4 hover:underline"
                          onClick={() => void run("rm", () => removePush({ data: { id: dev.id } }))}
                        >
                          {copy.removeDevice}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {ch === "telegram" && d.telegram.ready && prefs.telegram ? (
                <div className="flex flex-wrap items-center gap-2 pl-1 text-sm">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canWrite || busy !== null}
                    onClick={() => {
                      // Open the tab first so the browser doesn't block it.
                      const tab = window.open("", "_blank");
                      void run(
                        "tg",
                        async () => {
                          const { url } = await linkTg({ data: { hostId } });
                          if (tab) tab.location.href = url;
                          else window.location.href = url;
                        },
                        copy.telegramOpened,
                      );
                    }}
                  >
                    <Send className="size-4" /> {copy.connectTelegram}
                  </Button>
                  {d.chats.length ? (
                    <span className="text-xs text-muted-foreground">
                      {copy.telegramLinked(d.chats.length)}
                    </span>
                  ) : null}
                  {d.chats.map((c) => (
                    <span
                      key={c.id}
                      className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      {c.username ? `@${c.username}` : "Telegram"}
                      {canWrite ? (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => void run("untg", () => unlinkTg({ data: { id: c.id } }))}
                          aria-label={copy.unlink}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null}

              {ch === "sms" && ready.sms && prefs.sms ? (
                <label className="flex items-center gap-2 pl-1 text-sm">
                  <Switch
                    checked={prefs.smsUrgentOnly}
                    disabled={!canWrite || busy !== null}
                    onCheckedChange={(v) => void setPref({ smsUrgentOnly: v })}
                  />
                  {copy.smsUrgentOnly}
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canWrite ? (
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            void run("test", async () => {
              const r = await testFn({ data: { hostId } });
              const sent = Object.entries(r)
                .filter(([, v]) => v === "sent")
                .map(([k]) => copy.channels[k]![0].toLowerCase());
              toast.message(copy.testResult(sent));
            })
          }
        >
          {busy === "test" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <BellRing className="size-4" />
          )}{" "}
          {copy.test}
        </Button>
      ) : null}
    </section>
  );
}
