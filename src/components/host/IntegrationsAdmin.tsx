import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CircleCheck, CircleDashed, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { common, integrationsCopy as copy } from "@/content/copy";
import {
  connectTelegramWebhook,
  getIntegrationStatus,
  makeVapidKeys,
  saveIntegrationSettings,
  saveRoutine,
  sendTestSms,
} from "@/lib/admin.functions";

function Status({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="flex items-center gap-1 text-sm font-medium text-success">
      <CircleCheck className="size-4" /> {copy.ready}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <CircleDashed className="size-4" /> {copy.missing}
    </span>
  );
}

function Block({
  title,
  body,
  ok,
  children,
}: {
  title: string;
  body: string;
  ok: boolean | null;
  children?: React.ReactNode;
}) {
  return (
    <section className="card-soft space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-lg">{title}</h3>
        {ok === null ? null : <Status ok={ok} />}
      </div>
      <p className="text-sm text-muted-foreground">{body}</p>
      {children}
    </section>
  );
}

/** Latchkey admin: what's set up for email, push, Telegram, SMS and inbound email. */
export function IntegrationsAdmin() {
  const statusFn = useServerFn(getIntegrationStatus);
  const saveFn = useServerFn(saveIntegrationSettings);
  const tgFn = useServerFn(connectTelegramWebhook);
  const vapidFn = useServerFn(makeVapidKeys);
  const smsFn = useServerFn(sendTestSms);
  const routineFn = useServerFn(saveRoutine);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["integration-status"], queryFn: () => statusFn() });
  const [address, setAddress] = useState("");
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [smsTo, setSmsTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) setAddress(q.data.inbound.address ?? "");
  }, [q.data]);

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["integration-status"] });
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading || !q.data) return <Skeleton className="h-96 rounded-2xl" />;
  const s = q.data;
  return (
    <div className="space-y-4">
      <div className="card-soft p-5">
        <h2 className="text-xl">{copy.title}</h2>
        <p className="text-muted-foreground">{copy.body}</p>
      </div>

      <Block title={copy.email.title} body={copy.email.body} ok={null} />

      <Block title={copy.push.title} body={copy.push.body} ok={s.push.ready}>
        {!s.push.ready ? (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => void run("vapid", async () => setKeys(await vapidFn()))}
          >
            {busy === "vapid" ? <Loader2 className="size-4 animate-spin" /> : null} {copy.push.make}
          </Button>
        ) : null}
        {keys ? (
          <div className="space-y-2 rounded-xl border-2 border-accent/40 bg-accent/10 p-3 text-sm">
            <p className="font-medium">{copy.push.warn}</p>
            <p>
              VAPID_PUBLIC_KEY{" "}
              <code className="block break-all rounded bg-surface p-2 text-xs">
                {keys.publicKey}
              </code>
            </p>
            <p>
              VAPID_PRIVATE_KEY{" "}
              <code className="block break-all rounded bg-surface p-2 text-xs">
                {keys.privateKey}
              </code>
            </p>
          </div>
        ) : null}
      </Block>

      <Block title={copy.telegram.title} body={copy.telegram.body} ok={s.telegram.webhookSet}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {s.telegram.bot ? <span>{copy.telegram.bot(s.telegram.bot)}</span> : null}
          {s.telegram.tokenSet && !s.telegram.webhookSet ? (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "tg",
                  () => tgFn(),
                  s.telegram.bot ? copy.telegram.connected(s.telegram.bot) : undefined,
                )
              }
            >
              {busy === "tg" ? <Loader2 className="size-4 animate-spin" /> : null}{" "}
              {copy.telegram.connect}
            </Button>
          ) : null}
        </div>
      </Block>

      <Block title={copy.sms.title} body={copy.sms.body} ok={s.sms.ready}>
        {s.sms.ready ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-10 w-56"
              placeholder="+447400123456"
              aria-label={copy.sms.to}
              value={smsTo}
              onChange={(e) => setSmsTo(e.target.value.replace(/\s/g, ""))}
            />
            <Button
              variant="outline"
              disabled={busy !== null || !/^\+\d{7,15}$/.test(smsTo)}
              onClick={() => void run("sms", () => smsFn({ data: { to: smsTo } }), copy.sms.sent)}
            >
              {copy.sms.test}
            </Button>
          </div>
        ) : null}
      </Block>

      <Block title={copy.firecrawl.title} body={copy.firecrawl.body} ok={s.firecrawl.keySet}>
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={s.firecrawl.enabled}
            disabled={busy !== null || (!s.firecrawl.keySet && !s.firecrawl.enabled)}
            onCheckedChange={(v) =>
              void run(
                "firecrawl",
                () =>
                  routineFn({ data: { key: "listing_import", enabled: v, everyMinutes: null } }),
                copy.firecrawl.switched(v),
              )
            }
            aria-label={copy.firecrawl.title}
          />
          {s.firecrawl.enabled ? copy.firecrawl.on : copy.firecrawl.off}
          {!s.firecrawl.keySet ? (
            <span className="text-muted-foreground">· {copy.firecrawl.needsKey}</span>
          ) : null}
        </label>
      </Block>

      <Block
        title={copy.inbound.title}
        body={copy.inbound.body}
        ok={s.inbound.secretSet && !!s.inbound.address}
      >
        <div className="space-y-2 text-sm">
          <label className="block space-y-1">
            <span className="font-medium">{copy.inbound.address}</span>
            <div className="flex flex-wrap gap-2">
              <Input
                className="h-10 min-w-64 flex-1"
                placeholder={copy.inbound.placeholder}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "inbound",
                    () => saveFn({ data: { inboundAddress: address } }),
                    copy.inbound.saved,
                  )
                }
              >
                {copy.inbound.save}
              </Button>
            </div>
          </label>
          <p>
            <span className="font-medium">{copy.inbound.webhook}: </span>
            <code className="break-all text-xs">
              {s.origin}/api/public/inbound-email/&lt;INBOUND_EMAIL_SECRET&gt;
            </code>
          </p>
        </div>
      </Block>
    </div>
  );
}
