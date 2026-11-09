import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Lightbulb, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { common, smartThingsAdminCopy as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import {
  forgetSmartThingsApp,
  getSmartThingsApp,
  setRoomLightsProvider,
  setupSmartThingsApp,
} from "@/lib/room-devices.functions";
import { PROVIDERS, type Provider } from "@/lib/room-devices";
import { cn } from "@/lib/utils";

/**
 * Latchkey admin → System → SmartThings: makes Latchkey's one SmartThings
 * app from a token pasted once, so every host only presses "Connect
 * SmartThings". The token isn't kept; the app's keys stay on the server.
 */
export function SmartThingsAdmin() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSmartThingsApp);
  const setupFn = useServerFn(setupSmartThingsApp);
  const forgetFn = useServerFn(forgetSmartThingsApp);
  const providerFn = useServerFn(setRoomLightsProvider);
  const q = useQuery({ queryKey: ["smartthings-app"], queryFn: () => getFn() });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);

  async function run(f: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await f();
      setToken("");
      setAgain(false);
      toast.success(done);
      await qc.invalidateQueries({ queryKey: ["smartthings-app"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  if (!q.data)
    return (
      <div className="card-soft grid place-items-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  const { app, callback, provider } = q.data;
  const choose = (p: Provider) =>
    void run(() => providerFn({ data: { provider: p } }), copy.switched);
  const moved = !!app && app.redirectUri !== callback;
  return (
    <section className="card-soft space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg">
          <Lightbulb className="size-5 text-primary" /> {copy.title}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.intro}</p>
      </div>

      <div role="radiogroup" aria-label={copy.title} className="grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={provider === p}
            disabled={busy}
            onClick={() => (provider === p ? null : choose(p))}
            className={cn(
              "rounded-xl border p-3 text-left text-sm",
              provider === p
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-secondary",
            )}
          >
            <span className="block font-medium">{copy.providers[p]?.name}</span>
            <span className="text-muted-foreground">{copy.providers[p]?.body}</span>
          </button>
        ))}
      </div>

      {provider !== "smartthings" ? null : app ? (
        <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <p>{copy.ready(formatUkDate(app.createdAt.slice(0, 10)))}</p>
          <p className="break-all text-muted-foreground">{app.redirectUri}</p>
          {moved ? <p className="text-destructive">{copy.moved(callback)}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setAgain(true)} disabled={busy}>
              {copy.makeAgain}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void run(() => forgetFn(), copy.forgotten)}
              disabled={busy}
            >
              {copy.forget}
            </Button>
          </div>
        </div>
      ) : null}

      {provider === "smartthings" && (!app || again) ? (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              {copy.step1}{" "}
              <a
                href="https://account.smartthings.com/tokens"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                account.smartthings.com/tokens <ExternalLink className="size-3" aria-hidden />
              </a>
            </li>
            <li>{copy.step2}</li>
            <li>{copy.step3}</li>
          </ol>
          <div className="space-y-1">
            <Label htmlFor="st-token">{copy.tokenLabel}</Label>
            <Input
              id="st-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{copy.tokenNote}</p>
          </div>
          <Button
            onClick={() => void run(() => setupFn({ data: { token } }), copy.done)}
            disabled={busy || token.trim().length < 20}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.setUp}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
