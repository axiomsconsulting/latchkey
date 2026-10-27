/* eslint-disable @typescript-eslint/no-explicit-any -- the 0061 tables aren't in the generated types yet, and Stripe payloads are read field by field */
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Check, CheckCircle2, Circle, Clock, Copy, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { partnerCopy as copy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { reasonText } from "@/lib/commission";
import { myPartnerSteps, stopBeingPartner } from "@/lib/partner-agreement.functions";
import { ukDateTime } from "@/lib/partner-agreement";
import {
  myPartnerAccount,
  partnerStripeDashboard,
  refreshPartnerStripe,
  startPartnerPayouts,
} from "@/lib/partners.functions";
import { formatPence } from "@/lib/services";

/** A Commission Partner's own account: status, referral link and code, payouts set-up, referred hosts (initials and town only) and balances. */
export const Route = createFileRoute("/_authenticated/partners/")({
  head: () => ({ meta: [{ title: rebrand("Your Commission Partner account · Latchkey") }] }),
  component: PartnerAccount,
});

const STATUS_WORDS: Record<string, string> = {
  trial: "On free trial",
  paying: "Paying",
  paused: "Paused",
  cap_reached: "12 months done",
  ended: "Ended",
};
const BONUS_WORDS: Record<string, string> = {
  pending: "Pending",
  earned: "Earned",
  withheld: "Held for now",
  reversed: "Reversed",
  paid: "Paid",
  not_eligible: "Not eligible",
};

function PartnerAccount() {
  const load = useServerFn(myPartnerAccount);
  const q = useQuery({ queryKey: ["partner-account"], queryFn: () => load() });
  const d = q.data;
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-5 pb-32 pt-4 md:pb-16">
        <h1 className="text-3xl">{copy.accountTitle}</h1>
        {q.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
        {d && !d.setUp ? <p className="card-soft p-5">{copy.notSetUp}</p> : null}
        {d?.setUp && !d.partner ? (
          <p className="card-soft p-5">
            <Link to="/partners/join" className="text-primary underline">
              {copy.joinTitle}
            </Link>
          </p>
        ) : null}
        {d?.setUp && d.partner ? (
          <>
            <Steps />
            <Account data={d as Extract<typeof d, { partner: object }>} />
            <Stop />
          </>
        ) : null}
      </main>
    </div>
  );
}

function Account({ data: d }: { data: any }) {
  const p = d.partner;
  return (
    <>
      {p.status === "pending_review" || p.status === "applied" ? (
        <p className="card-soft p-5">{copy.statusPending}</p>
      ) : null}
      {p.status === "waitlisted" ? <p className="card-soft p-5">{copy.statusWaitlisted}</p> : null}
      {p.status === "suspended" ? <p className="card-soft p-5">{copy.statusSuspended}</p> : null}
      {p.status === "terminated" ? <p className="card-soft p-5">{copy.statusTerminated}</p> : null}
      {p.status === "active" && d.link && d.canRefer ? <ShareLink link={d.link} code={p.referral_code} /> : null}
      {p.status === "active" && !d.canRefer && !p.terminated_at ? (
        <p className="card-soft p-5">{copy.needsAgreementAndId}</p>
      ) : null}
      {p.status === "active" || p.status === "terminated" ? <Payouts partner={p} /> : null}
      <section className="grid gap-3 sm:grid-cols-3">
        <Tile label={copy.held} value={formatPence(d.balance.held)} hint={copy.heldHintDays(d.holdDays)} />
        <Tile label={copy.payable} value={formatPence(d.balance.payable)} />
        <Tile label={copy.paid} value={formatPence(d.balance.paid)} />
      </section>
      <p className="text-sm text-muted-foreground">{copy.minNote(formatPence(d.minPayoutPence))}</p>
      <section className="card-soft space-y-3 p-5">
        <h2 className="text-xl">{copy.hostsTitle}</h2>
        {d.referrals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.hostsEmptyDays(d.attributionWindowDays)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Host</th>
                  <th className="py-2 pr-3 font-medium">Signed up</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Paid months</th>
                  <th className="py-2 pr-3 font-medium">{copy.bonus}</th>
                  <th className="py-2 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {d.referrals.map((r: any) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 pr-3">{r.host_label ?? "Host"}</td>
                    <td className="py-2 pr-3">
                      {new Date(r.sign_up_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-2 pr-3">
                      {r.status === "not_counted"
                        ? "Not counted"
                        : r.status === "pending_review"
                          ? "Being checked"
                          : (STATUS_WORDS[r.status_detail] ?? r.status_detail)}
                    </td>
                    <td className="py-2 pr-3">
                      {copy.monthsUsedOf(r.paid_months_used, r.terms_snapshot?.paid_months_cap ?? 12)}
                    </td>
                    <td className="py-2 pr-3">
                      {BONUS_WORDS[r.bonus_status] ?? r.bonus_status}
                      {r.bonus_ineligible_reason ? (
                        <span className="block text-xs text-muted-foreground">
                          {reasonText(r.bonus_ineligible_reason)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2">{(r.terms_snapshot?.rate_bps ?? 0) / 100}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {d.payouts.length ? (
        <section className="card-soft space-y-2 p-5">
          <h2 className="text-xl">{copy.payoutsList}</h2>
          <ul className="divide-y divide-border text-sm">
            {d.payouts.map((po: any) => (
              <li key={po.id} className="flex justify-between gap-3 py-2">
                <span>{new Date(po.sent_at ?? po.created_at).toLocaleDateString("en-GB")}</span>
                <span>{po.status.replace(/_/g, " ")}</span>
                <span className="font-medium">{formatPence(po.amount_pence)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ShareLink({ link, code }: { link: string; code: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(link, { width: 320, margin: 1 }).then(setQr);
  }, [link]);
  const copyIt = (v: string) => void navigator.clipboard.writeText(v).then(() => setCopied(v));
  return (
    <section className="card-soft grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-3">
        <div>
          <p className="text-sm text-muted-foreground">{copy.yourLink}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 truncate rounded-lg bg-muted px-2 py-1 text-sm">{link}</code>
            <Button size="sm" variant="outline" onClick={() => copyIt(link)}>
              {copied === link ? <Check className="size-4" /> : <Copy className="size-4" />}{" "}
              {copied === link ? copy.copied : copy.copy}
            </Button>
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{copy.yourCode}</p>
          <div className="flex items-center gap-2">
            <code className="rounded-lg bg-muted px-2 py-1 text-lg font-semibold tracking-wider">
              {code}
            </code>
            <Button size="sm" variant="outline" onClick={() => copyIt(code)}>
              {copied === code ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
      {qr ? <img src={qr} alt="" className="size-32 rounded-lg bg-white p-1" /> : null}
    </section>
  );
}

function Payouts({ partner: p }: { partner: any }) {
  const start = useServerFn(startPartnerPayouts);
  const dash = useServerFn(partnerStripeDashboard);
  const refresh = useServerFn(refreshPartnerStripe);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ url?: string } | unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const out = (await fn()) as { url?: string };
      if (out?.url) window.location.href = out.url;
      else await qc.invalidateQueries({ queryKey: ["partner-account"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  // Back from Stripe's onboarding: ask once whether payouts are ready.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("stripe") === "done")
      void run(() => refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="card-soft space-y-3 p-5">
      <h2 className="text-xl">{copy.payoutsTitle}</h2>
      {p.stripe_account_mode === "test" ? (
        <p className="text-xs font-medium uppercase tracking-wide text-accent">{copy.testMode}</p>
      ) : null}
      {p.payout_route !== "express" ? (
        <p className="text-sm text-muted-foreground">{copy.payoutsOther}</p>
      ) : p.payouts_enabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{copy.payoutsReady}</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => dash())}>
            <ExternalLink className="size-4" /> {copy.payoutsDashboard}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || p.status !== "active"} onClick={() => run(() => start())}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {p.stripe_account_id ? copy.payoutsContinue : copy.payoutsSetUp}
          </Button>
          {p.stripe_account_id ? (
            <Button variant="outline" disabled={busy} onClick={() => run(() => refresh())}>
              <RefreshCw className="size-4" /> {copy.payoutsCheck}
            </Button>
          ) : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** The partner's way to activation (agreement 3.6) and their signed copy (4.4). */
function Steps() {
  const load = useServerFn(myPartnerSteps);
  const q = useQuery({ queryKey: ["partner-steps"], queryFn: () => load() });
  const s = q.data;
  if (!s?.partner || s.stopped) return null;
  const m = s.missing;
  const signDone = !m.includes("agreement") && !m.includes("new_version");
  const idDone = s.idCheckStatus === "approved";
  const idWaiting = s.idCheckStatus === "pending" || s.idCheckStatus === "manual_review";
  const rows: Array<{ label: string; state: "done" | "todo" | "waiting"; to?: "/partners/agreement" | "/partners/verify" }> = [
    { label: m.includes("new_version") ? copy.stepNewVersion : copy.stepSign, state: signDone ? "done" : "todo", to: "/partners/agreement" },
    { label: copy.stepVerify, state: idDone ? "done" : idWaiting ? "waiting" : "todo", to: "/partners/verify" },
    { label: copy.stepApproval, state: m.length === 0 ? "done" : "waiting" },
  ];
  return (
    <>
      {m.length ? (
        <section className="card-soft space-y-3 p-5">
          <h2 className="text-xl">{copy.stepsTitle}</h2>
          <ol className="space-y-3">
            {rows.map((r) => (
              <li key={r.label} className="flex flex-wrap items-center gap-3">
                {r.state === "done" ? (
                  <CheckCircle2 className="size-5 text-primary" />
                ) : r.state === "waiting" ? (
                  <Clock className="size-5 text-muted-foreground" />
                ) : (
                  <Circle className="size-5 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">{r.label}</span>
                {r.state === "todo" && r.to ? (
                  <Button asChild size="sm">
                    <Link to={r.to}>{copy.stepOpen}</Link>
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {r.state === "done" ? copy.stepDone : r.state === "waiting" ? copy.stepWaiting : copy.stepToDo}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {s.agreement ? (
        <section className="card-soft space-y-2 p-5">
          <h2 className="text-xl">{copy.yourAgreement}</h2>
          <p className="text-sm">
            {copy.agreementSigned(s.agreement.version, ukDateTime(s.agreement.signedAt))}{" "}
            {s.agreement.confirmed ? copy.agreementConfirmed : copy.agreementUnconfirmed}
          </p>
          <div className="flex flex-wrap gap-2">
            {s.agreement.pdfUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={s.agreement.pdfUrl} target="_blank" rel="noopener">
                  <Download className="size-4" /> {copy.downloadSigned}
                </a>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm">
              <Link to="/partners/agreement">{copy.readAgreement}</Link>
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}

/** "Stop being a Commission Partner" (20.1, 21.2), with a typed confirmation. */
function Stop() {
  const load = useServerFn(myPartnerSteps);
  const q = useQuery({ queryKey: ["partner-steps"], queryFn: () => load() });
  const stop = useServerFn(stopBeingPartner);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!q.data?.partner || q.data.stopped) return done ? <p className="card-soft p-5">{copy.stopped}</p> : null;
  return (
    <section className="card-soft space-y-3 p-5">
      <h2 className="text-lg">{copy.stopTitle}</h2>
      <p className="text-sm text-muted-foreground">{copy.stopBody}</p>
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          {copy.stopButton}
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            {copy.stopConfirmLabel}
            <Input className="h-11 w-40" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <Button
            variant="destructive"
            disabled={typed !== "STOP" || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await stop({ data: { confirm: "STOP" } });
                setDone(true);
                await qc.invalidateQueries();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} {copy.stopButton}
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-soft p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
