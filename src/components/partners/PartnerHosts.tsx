import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { common, partnerSetupCopy as copy } from "@/content/copy";
import {
  cancelHostSetup,
  handOverSetup,
  listHostSetups,
  startHostSetup,
  startOwnBusiness,
} from "@/lib/partner-setup.functions";
import { setActiveHost } from "@/lib/team.functions";

/**
 * The partner portal's host side (agreement v1.3): their own host business
 * (3.2(b), never earning commission) and businesses they set up for hosts and
 * hand over (6.9). `canRefer` is whether their code works today.
 */
export function PartnerHosts({ canRefer }: { canRefer: boolean }) {
  const list = useServerFn(listHostSetups);
  const own = useServerFn(startOwnBusiness);
  const start = useServerFn(startHostSetup);
  const handOver = useServerFn(handOverSetup);
  const cancel = useServerFn(cancelHostSetup);
  const switchTo = useServerFn(setActiveHost);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["partner-setups"], queryFn: () => list() });
  const [busy, setBusy] = useState<string | null>(null);
  const [ownName, setOwnName] = useState("");
  const [form, setForm] = useState({ businessName: "", ownerName: "", ownerEmail: "" });

  async function act<T>(key: string, fn: () => Promise<T>, after?: (r: T) => void | Promise<void>) {
    setBusy(key);
    try {
      const r = await fn();
      await after?.(r);
      await qc.invalidateQueries({ queryKey: ["partner-setups"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
    }
  }
  const openDashboard = async (hostId: string, to: "/app/setup" | "/app/today") => {
    await switchTo({ data: { hostId } });
    await qc.invalidateQueries({ queryKey: ["workspace"] });
    await navigate({ to });
  };

  const d = q.data;
  const setups = d?.setups ?? [];
  const live = setups.filter((s) => s.status === "setting_up" || s.status === "invited");
  const done = setups.filter((s) => s.status === "handed_over" || s.status === "cancelled");

  return (
    <section className="card-soft space-y-5 p-5" data-tour="partner-hosts">
      <div>
        <h2 className="text-xl">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.intro}</p>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">{copy.ownTitle}</h3>
        {d?.ownBusinesses.length ? (
          <ul className="space-y-2">
            {d.ownBusinesses.map((b) => (
              <li key={b.hostId} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">{b.businessName}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void openDashboard(b.hostId, "/app/today")}
                >
                  <ExternalLink /> {copy.open}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                "own",
                () => own({ data: { businessName: ownName.trim() } }),
                async (r) => openDashboard(r.hostId, "/app/setup"),
              );
            }}
          >
            <p className="w-full text-sm text-muted-foreground">{copy.ownNone}</p>
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="own-name">{copy.ownName}</Label>
              <Input
                id="own-name"
                value={ownName}
                maxLength={120}
                onChange={(e) => setOwnName(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={!ownName.trim() || busy !== null}>
              {busy === "own" ? <Loader2 className="animate-spin" /> : null}
              {copy.ownStart}
            </Button>
          </form>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">{copy.setupTitle}</h3>
        {!canRefer ? (
          <p className="text-sm text-muted-foreground">{copy.setupNeedsActive}</p>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                "start",
                () => start({ data: form }),
                async (r) => {
                  setForm({ businessName: "", ownerName: "", ownerEmail: "" });
                  await openDashboard(r.hostId, "/app/setup");
                },
              );
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="setup-business">{copy.businessName}</Label>
              <Input
                id="setup-business"
                value={form.businessName}
                maxLength={120}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="setup-owner">{copy.ownerName}</Label>
              <Input
                id="setup-owner"
                value={form.ownerName}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="setup-email">{copy.ownerEmail}</Label>
              <Input
                id="setup-email"
                type="email"
                value={form.ownerEmail}
                maxLength={254}
                autoComplete="off"
                onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
              />
            </div>
            <p className="text-sm text-muted-foreground sm:col-span-2">{copy.ownerEmailHint}</p>
            <Button
              type="submit"
              disabled={
                busy !== null ||
                !form.businessName.trim() ||
                form.ownerName.trim().length < 2 ||
                !/^\S+@\S+\.\S+$/.test(form.ownerEmail.trim())
              }
            >
              {busy === "start" ? <Loader2 className="animate-spin" /> : null}
              {copy.start}
            </Button>
          </form>
        )}
      </div>

      {setups.length ? (
        <div className="space-y-2">
          <h3 className="font-medium">{copy.setupsTitle}</h3>
          <ul className="divide-y divide-border">
            {[...live, ...done].map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.businessName || s.ownerName}</span>
                  <span className="block text-sm text-muted-foreground">
                    {s.ownerName} · {s.ownerEmail} · {copy.status[s.status]}
                  </span>
                </span>
                {s.status === "setting_up" || s.status === "invited" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openDashboard(s.hostId, "/app/today")}
                    >
                      <ExternalLink /> {copy.open}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        void act(
                          `hand-${s.id}`,
                          () => handOver({ data: { setupId: s.id } }),
                          (r) => {
                            if (r.emailed) toast.success(copy.sent(s.ownerEmail));
                            else toast.error(copy.notSent);
                          },
                        )
                      }
                    >
                      {busy === `hand-${s.id}` ? <Loader2 className="animate-spin" /> : <Send />}
                      {s.status === "invited" ? copy.sendAgain : copy.handOver}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy !== null}
                      onClick={() => {
                        if (!window.confirm(copy.cancelConfirm)) return;
                        void act(`cancel-${s.id}`, () => cancel({ data: { setupId: s.id } }));
                      }}
                    >
                      <X /> {copy.cancel}
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
