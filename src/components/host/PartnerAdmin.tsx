/* eslint-disable @typescript-eslint/no-explicit-any -- the 0061 tables aren't in the generated types yet, and Stripe payloads are read field by field */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { payoutUrgent, reasonText } from "@/lib/commission";
import {
  approveAndSendPayout,
  cancelPayout,
  partnerStatementCsv,
  recordManualPayout,
  runMonthCloseNow,
} from "@/lib/partner-close.functions";
import { PARTNER_DEFAULTS, type PartnerConfig } from "@/lib/partner-config";
import type { PayoutMode } from "@/lib/partner-eligibility";
import {
  adminPartnerOverview,
  applyTermsToExisting,
  approvePartner,
  resetPartnerStripe,
  resolveFraudFlag,
  reviewReferral,
  saveCommissionTerms,
  saveProgrammeSettings,
  setPartnerStatus,
} from "@/lib/partners.functions";
import { formatPence } from "@/lib/services";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Latchkey admin → Commission Partners: the month close and payouts (sent
 * only on approval), partners, the referral review queue, fraud flags,
 * effective-dated terms and the programme's open decisions.
 */
export function PartnerAdmin() {
  const load = useServerFn(adminPartnerOverview);
  const q = useQuery({ queryKey: ["admin-partners"], queryFn: () => load() });
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-partners"] });
  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.error) return <p className="text-sm text-destructive">{errText(q.error)}</p>;
  const d = q.data;
  if (!d || !d.setUp)
    return (
      <p className="card-soft p-5">
        Commission Partners aren't set up yet: migration 0061 hasn't been applied.
      </p>
    );
  return (
    <div className="space-y-6">
      <PayoutModeCard mode={d.payoutMode} />
      <div className="card-soft flex flex-wrap items-center gap-3 p-4 text-sm">
        {d.trialWarning ? (
          <span className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="size-4" /> {d.trialWarning}
          </span>
        ) : null}
        <span className="text-muted-foreground">
          Payouts are drafted by the month close and only sent when you approve them.
        </span>
      </div>
      <Payouts d={d} refresh={refresh} />
      <Partners d={d} refresh={refresh} />
      <Referrals d={d} refresh={refresh} />
      <Flags d={d} refresh={refresh} />
      <Terms d={d} refresh={refresh} />
      <Settings config={d.config as PartnerConfig} refresh={refresh} />
    </div>
  );
}

type Props = { d: any; refresh: () => void };

/** Test or live, why, and what's left to go live. Live is only switched on in Lovable Cloud's secrets. */
function PayoutModeCard({ mode: m }: { mode: PayoutMode }) {
  return (
    <section className="card-soft space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={m.mode === "live" ? "destructive" : "secondary"}>
          Stripe: {m.mode === "live" ? "Live" : m.mode === "test" ? "Test" : "Off"}
        </Badge>
        <span>{m.summary}</span>
      </div>
      {m.toGoLive.length ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">How to go live</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            {m.toGoLive.map((t) => (
              <li key={t}>{t}</li>
            ))}
            <li>
              Partners who set up payouts in test mode need their Stripe account reset (below), then
              set up payouts again.
            </li>
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="card-soft space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error(errText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

const partnerName = (d: any, id: string) => {
  const p = d.partners.find((x: any) => x.id === id);
  return p ? p.business_name || p.legal_name : "Partner";
};

function Payouts({ d, refresh }: Props) {
  const close = useServerFn(runMonthCloseNow);
  const send = useServerFn(approveAndSendPayout);
  const manual = useServerFn(recordManualPayout);
  const cancel = useServerFn(cancelPayout);
  const statement = useServerFn(partnerStatementCsv);
  const { busy, run } = useAction();
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const open = d.payouts.filter((p: any) =>
    ["draft", "approved", "failed", "manual_pending", "sending"].includes(p.status),
  );
  const now = Date.now();
  return (
    <Section
      title="Payouts"
      action={
        <Button
          size="sm"
          disabled={!!busy}
          onClick={() =>
            run("close", async () => {
              const s = await close();
              toast.success(
                `Month close: ${s.drafted} payouts drafted, ${s.bonusesEarned} bonuses earned, ${s.released} lines released, ${s.carried.length} carried forward.`,
              );
              refresh();
            })
          }
        >
          {busy === "close" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}{" "}
          Run month close now
        </Button>
      }
    >
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payouts waiting.</p>
      ) : null}
      <ul className="divide-y divide-border">
        {open.map((p: any) => {
          const urgent = p.due_by && payoutUrgent(p.due_by, now);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="min-w-40 font-medium">{partnerName(d, p.partner_id)}</span>
              <span className="font-semibold">{formatPence(p.amount_pence)}</span>
              <Badge variant="outline">{p.route}</Badge>
              <Badge variant={p.status === "failed" ? "destructive" : "secondary"}>
                {p.status.replace(/_/g, " ")}
              </Badge>
              {p.due_by ? (
                <span className={urgent ? "font-medium text-destructive" : "text-muted-foreground"}>
                  Due by {p.due_by}
                </span>
              ) : null}
              {p.est_fee_pence ? (
                <span className="text-muted-foreground">
                  Stripe fees about {formatPence(p.est_fee_pence)}
                </span>
              ) : null}
              {p.failure ? (
                <span className="w-full text-xs text-destructive">{p.failure}</span>
              ) : null}
              <span className="ml-auto flex flex-wrap gap-2">
                {p.status === "manual_pending" ? (
                  <>
                    <Input
                      className="h-9 w-44"
                      placeholder="Bank reference"
                      value={refs[p.id] ?? ""}
                      onChange={(e) => setRefs((r) => ({ ...r, [p.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={!!busy || (refs[p.id] ?? "").trim().length < 3}
                      onClick={() =>
                        run(
                          p.id,
                          async () => {
                            await manual({ data: { payoutId: p.id, reference: refs[p.id]! } });
                            refresh();
                          },
                          "Marked as paid",
                        )
                      }
                    >
                      Mark paid
                    </Button>
                  </>
                ) : p.status !== "sending" ? (
                  <Button
                    size="sm"
                    disabled={!!busy}
                    onClick={() =>
                      run(p.id, async () => {
                        const r = await send({ data: { payoutId: p.id } });
                        if (r.status === "sent") toast.success("Sent");
                        else if (r.status === "manual_pending")
                          toast.success("Ready to pay by hand");
                        else toast.error(r.status === "refused" ? r.reason : r.failure);
                        refresh();
                      })
                    }
                  >
                    {busy === p.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}{" "}
                    Approve and send
                  </Button>
                ) : null}
                {p.status !== "sending" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!busy}
                    onClick={() =>
                      run(
                        `c${p.id}`,
                        async () => {
                          await cancel({ data: { payoutId: p.id, reason: "Cancelled by admin" } });
                          refresh();
                        },
                        "Cancelled",
                      )
                    }
                  >
                    Cancel
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="stmt-month">Statements for</Label>
          <Input
            id="stmt-month"
            type="month"
            className="h-9 w-40"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        {d.partners
          .filter((p: any) => p.status !== "applied")
          .slice(0, 30)
          .map((p: any) => (
            <Button
              key={p.id}
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                run(`s${p.id}`, async () => {
                  const { csv } = await statement({ data: { partnerId: p.id, month } });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                  a.download = `commission-statement-${(p.referral_code ?? p.id).toLowerCase()}-${month}.csv`;
                  a.click();
                })
              }
            >
              <Download className="size-4" /> {p.referral_code ?? partnerName(d, p.id)}
            </Button>
          ))}
      </div>
    </Section>
  );
}

function Partners({ d, refresh }: Props) {
  const approve = useServerFn(approvePartner);
  const setStatus = useServerFn(setPartnerStatus);
  const resetStripe = useServerFn(resetPartnerStripe);
  const { busy, run } = useAction();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [breach, setBreach] = useState<Record<string, boolean>>({});
  return (
    <Section title={`Commission Partners (${d.partners.length})`}>
      {d.partners.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No applications yet. The sign-up page is /partners/join.
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {d.partners.map((p: any) => {
          const b = d.balances[p.id] ?? { held: 0, payable: 0, paid: 0 };
          const why = reason[p.id] ?? "";
          return (
            <li key={p.id} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.business_name || p.legal_name}</span>
                <span className="text-muted-foreground">
                  {p.email} · {p.country}
                </span>
                <Badge variant="secondary">{p.status}</Badge>
                <Badge variant="outline">{p.payout_route}</Badge>
                {p.referral_code ? (
                  <code className="rounded bg-muted px-1.5">{p.referral_code}</code>
                ) : null}
                {p.payout_route === "express" ? (
                  <Badge variant={p.payouts_enabled ? "secondary" : "outline"}>
                    {p.payouts_enabled ? "Stripe can pay" : "Stripe not ready"}
                    {p.stripe_account_mode ? ` · ${p.stripe_account_mode}` : ""}
                  </Badge>
                ) : null}
                {p.stripe_account_mode && p.stripe_account_mode !== d.payoutMode.mode ? (
                  <Badge variant="destructive">
                    Stripe account from {p.stripe_account_mode} mode
                  </Badge>
                ) : null}
                {p.termination_for_breach ? (
                  <Badge variant="destructive">ended for breach</Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground">
                Held {formatPence(b.held)} · payable {formatPence(b.payable)} · paid{" "}
                {formatPence(b.paid)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {p.status === "pending_review" ||
                p.status === "applied" ||
                p.status === "waitlisted" ? (
                  <Button
                    size="sm"
                    disabled={!!busy}
                    onClick={() =>
                      run(p.id, async () => {
                        const r = await approve({ data: { partnerId: p.id } });
                        toast.success(`Approved: ${r.code}`);
                        refresh();
                      })
                    }
                  >
                    <CheckCircle2 className="size-4" /> Approve and issue code
                  </Button>
                ) : null}
                {p.status !== "terminated" ? (
                  <>
                    <Input
                      className="h-9 w-56"
                      placeholder="Reason (suspend / end / reset)"
                      value={why}
                      onChange={(e) => setReason((r) => ({ ...r, [p.id]: e.target.value }))}
                    />
                    {p.status === "suspended" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy || why.length < 3}
                        onClick={() =>
                          run(`a${p.id}`, async () => {
                            await setStatus({
                              data: { partnerId: p.id, status: "active", reason: why },
                            });
                            refresh();
                          })
                        }
                      >
                        Re-activate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy || why.length < 3}
                        onClick={() =>
                          run(`s${p.id}`, async () => {
                            await setStatus({
                              data: { partnerId: p.id, status: "suspended", reason: why },
                            });
                            refresh();
                          })
                        }
                      >
                        Suspend
                      </Button>
                    )}
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={!!breach[p.id]}
                        onCheckedChange={(v) => setBreach((x) => ({ ...x, [p.id]: v }))}
                      />{" "}
                      For breach (11.3)
                    </label>
                    {p.stripe_account_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy || why.length < 3}
                        title="Forgets this Stripe account so the partner sets up payouts again. The account stays in Stripe."
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Reset this partner's Stripe account? They'll need to set up payouts again. The old account stays in Stripe.",
                            )
                          )
                            return;
                          void run(
                            `r${p.id}`,
                            async () => {
                              await resetStripe({ data: { partnerId: p.id, reason: why } });
                              refresh();
                            },
                            "Stripe account reset",
                          );
                        }}
                      >
                        <RotateCcw className="size-4" /> Reset Stripe account
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!!busy || why.length < 3}
                      onClick={() =>
                        run(
                          `t${p.id}`,
                          async () => {
                            await setStatus({
                              data: {
                                partnerId: p.id,
                                status: "terminated",
                                reason: why,
                                breach: !!breach[p.id],
                              },
                            });
                            refresh();
                          },
                          "Arrangement ended",
                        )
                      }
                    >
                      End arrangement
                    </Button>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Ended {p.terminated_at?.slice(0, 10)}: {p.termination_reason}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Referrals({ d, refresh }: Props) {
  const review = useServerFn(reviewReferral);
  const { busy, run } = useAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const queue = d.referrals.filter((r: any) => r.status !== "approved");
  const approved = d.referrals.filter((r: any) => r.status === "approved");
  return (
    <Section title={`Referrals to review (${queue.length})`}>
      {queue.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to review.</p>
      ) : null}
      <ul className="divide-y divide-border">
        {queue.map((r: any) => {
          const note = notes[r.id] ?? "";
          const strong = r.status === "rejected" && r.reject_reason;
          return (
            <li key={r.id} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.host_label ?? "Host"}</span>
                <span className="text-muted-foreground">
                  via {partnerName(d, r.partner_id)} ({r.source}), signed up{" "}
                  {r.sign_up_at?.slice(0, 10)}
                </span>
                <Badge variant={r.status === "rejected" ? "destructive" : "secondary"}>
                  {r.status === "rejected" ? `rejected: ${r.reject_reason}` : "pending review"}
                </Badge>
                {(r.flags ?? []).map((f: any) => (
                  <Badge key={f.kind} variant={f.strength === "strong" ? "destructive" : "outline"}>
                    {f.kind.replace(/_/g, " ")} · {f.strength}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="h-9 min-w-64 flex-1"
                  placeholder={strong ? "Override reason (needed to approve)" : "Note"}
                  value={note}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  disabled={!!busy || (!!strong && note.trim().length < 3)}
                  onClick={() =>
                    run(
                      r.id,
                      async () => {
                        await review({
                          data: {
                            referralId: r.id,
                            decision: "approve",
                            note,
                            ...(strong ? { override: note } : {}),
                          },
                        });
                        refresh();
                      },
                      "Approved",
                    )
                  }
                >
                  Approve
                </Button>
                {r.status !== "rejected" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      run(
                        `x${r.id}`,
                        async () => {
                          await review({ data: { referralId: r.id, decision: "reject", note } });
                          refresh();
                        },
                        "Rejected",
                      )
                    }
                  >
                    Reject
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {approved.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Approved referrals ({approved.length})
          </summary>
          <ul className="mt-2 divide-y divide-border">
            {approved.map((r: any) => (
              <li key={r.id} className="flex flex-wrap gap-2 py-2">
                <span className="font-medium">{r.host_label}</span>
                <span className="text-muted-foreground">{partnerName(d, r.partner_id)}</span>
                <span>
                  {r.paid_months_used}/12 · {r.status_detail}
                </span>
                <span>
                  Bonus: {r.bonus_status}
                  {r.bonus_ineligible_reason ? ` (${reasonText(r.bonus_ineligible_reason)})` : ""}
                </span>
                <span className="text-muted-foreground">
                  {r.terms_snapshot?.label} · {(r.terms_snapshot?.rate_bps ?? 0) / 100}%
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Section>
  );
}

function Flags({ d, refresh }: Props) {
  const resolve = useServerFn(resolveFraudFlag);
  const { busy, run } = useAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <Section title={`Fraud checks (${d.flags.length} open)`}>
      {d.flags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open checks.</p>
      ) : null}
      <ul className="divide-y divide-border">
        {d.flags.map((f: any) => {
          const note = notes[f.id] ?? "";
          const ref = d.referrals.find((r: any) => r.id === f.referral_id);
          return (
            <li key={f.id} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert
                  className={`size-4 ${f.strength === "strong" ? "text-destructive" : "text-muted-foreground"}`}
                />
                <span className="font-medium">{f.kind.replace(/_/g, " ")}</span>
                <Badge variant={f.strength === "strong" ? "destructive" : "outline"}>
                  {f.strength}
                </Badge>
                <span className="text-muted-foreground">
                  {ref ? `${ref.host_label} via ` : ""}
                  {partnerName(d, f.partner_id)}
                </span>
                <code className="text-xs text-muted-foreground">{JSON.stringify(f.details)}</code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-9 min-w-64 flex-1"
                  placeholder="What you found (logged)"
                  value={note}
                  onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!!busy || note.length < 3}
                  onClick={() =>
                    run(
                      f.id,
                      async () => {
                        await resolve({ data: { flagId: f.id, outcome: "confirm", note } });
                        refresh();
                      },
                      "Confirmed: commission and bonus withheld or reversed",
                    )
                  }
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy || note.length < 3}
                  onClick={() =>
                    run(
                      `d${f.id}`,
                      async () => {
                        await resolve({ data: { flagId: f.id, outcome: "dismiss", note } });
                        refresh();
                      },
                      "Dismissed",
                    )
                  }
                >
                  Dismiss
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Terms({ d, refresh }: Props) {
  const save = useServerFn(saveCommissionTerms);
  const raise = useServerFn(applyTermsToExisting);
  const { busy, run } = useAction();
  const current = d.terms.find(
    (t: any) => !t.partner_id && Date.parse(t.effective_from) <= Date.now(),
  );
  const [f, setF] = useState(() => ({
    label: "",
    effectiveFrom: new Date(Date.now() + 3_600_000).toISOString().slice(0, 16),
    rate: String((current?.rate_bps ?? 1000) / 100),
    cap: String(current?.paid_months_cap ?? 12),
    bonus: current?.bonus_amount_pence != null ? String(current.bonus_amount_pence / 100) : "",
    tiers: current?.bonus_tiers ? JSON.stringify(current.bonus_tiers) : "",
    endDate: current?.bonus_end_date ?? "",
    deadline: String(current?.bonus_first_payment_deadline_days ?? 60),
    notice: "",
    existing: false,
    writtenRef: "",
  }));
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Section title="Commission terms">
      <ul className="divide-y divide-border text-sm">
        {d.terms.map((t: any) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="font-medium">{t.label}</span>
            {t.partner_id ? (
              <Badge variant="outline">{partnerName(d, t.partner_id)} only</Badge>
            ) : null}
            <span>from {t.effective_from.slice(0, 16).replace("T", " ")}</span>
            <span>
              {t.rate_bps / 100}% · {t.paid_months_cap} months
            </span>
            <span>
              Bonus:{" "}
              {t.bonus_tiers
                ? "tiered"
                : t.bonus_amount_pence != null
                  ? formatPence(t.bonus_amount_pence)
                  : "none"}
              {t.bonus_end_date ? ` until ${t.bonus_end_date}` : " (no end date: none earned)"}
            </span>
            {t.applies_to_existing ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  run(t.id, async () => {
                    const r = await raise({ data: { termsId: t.id } });
                    toast.success(`${r.raised} referrals raised`);
                    refresh();
                  })
                }
              >
                Apply to hosts already referred
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            "terms",
            async () => {
              let tiers: Array<{ from_nth: number; pence: number }> | null = null;
              if (f.tiers.trim()) tiers = JSON.parse(f.tiers);
              await save({
                data: {
                  label: f.label,
                  effectiveFrom: new Date(f.effectiveFrom).toISOString(),
                  rateBps: Math.round(Number(f.rate) * 100),
                  paidMonthsCap: Number(f.cap),
                  bonusAmountPence: f.bonus.trim() ? Math.round(Number(f.bonus) * 100) : null,
                  bonusTiers: tiers,
                  bonusEndDate: f.endDate || null,
                  bonusFirstPaymentDeadlineDays: Number(f.deadline),
                  noticeSentAt: f.notice ? new Date(f.notice).toISOString() : null,
                  appliesToExisting: f.existing,
                  writtenNoticeRef: f.writtenRef || null,
                },
              });
              refresh();
            },
            "New terms saved",
          );
        }}
      >
        <p className="text-sm text-muted-foreground sm:col-span-3">
          New terms apply to hosts by their Sign-up Date. Anything lower than now needs the notice
          emailed first and starts 30+ days after it (6.5). A blank bonus amount or end date means
          no Launch Bonus.
        </p>
        <TField
          id="t-label"
          label="Label"
          value={f.label}
          onChange={set("label")}
          placeholder="v0.6-bonus"
        />
        <TField
          id="t-from"
          label="Takes effect"
          type="datetime-local"
          value={f.effectiveFrom}
          onChange={set("effectiveFrom")}
        />
        <TField id="t-rate" label="Rate (%)" type="number" value={f.rate} onChange={set("rate")} />
        <TField id="t-cap" label="Paid Months" type="number" value={f.cap} onChange={set("cap")} />
        <TField
          id="t-bonus"
          label="Launch Bonus (£, blank = none)"
          type="number"
          value={f.bonus}
          onChange={set("bonus")}
        />
        <TField
          id="t-end"
          label="Bonus End Date"
          type="date"
          value={f.endDate}
          onChange={set("endDate")}
        />
        <TField
          id="t-deadline"
          label="First payment within (days)"
          type="number"
          value={f.deadline}
          onChange={set("deadline")}
        />
        <TField
          id="t-notice"
          label="Notice emailed (for reductions)"
          type="datetime-local"
          value={f.notice}
          onChange={set("notice")}
        />
        <div className="space-y-1 sm:col-span-3">
          <Label htmlFor="t-tiers">
            Bonus tiers (optional JSON, e.g. [{"{"}"from_nth":1,"pence":5000{"}"}])
          </Label>
          <Textarea id="t-tiers" rows={2} value={f.tiers} onChange={set("tiers")} />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Switch
            checked={f.existing}
            onCheckedChange={(v) => setF((x) => ({ ...x, existing: v }))}
          />{" "}
          Also applies to hosts already referred (increases only, with written notice)
        </label>
        {f.existing ? (
          <TField
            id="t-ref"
            label="Written notice reference"
            value={f.writtenRef}
            onChange={set("writtenRef")}
          />
        ) : null}
        <Button
          type="submit"
          className="sm:col-span-3"
          disabled={!!busy || f.label.trim().length < 2}
        >
          Save new terms
        </Button>
      </form>
    </Section>
  );
}

function TField({
  id,
  label,
  ...rest
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-10" {...rest} />
    </div>
  );
}

/** The open decisions (D-numbers in the build notes) the super admin may change. */
const EDITABLE: Array<{ key: keyof PartnerConfig; label: string; options?: string[] }> = [
  { key: "holdDays", label: "Hold Period, days (D10; agreement 9.2)" },
  {
    key: "nonExpressRoute",
    label: "Partners outside UK/EEA/US/CA/CH (D2)",
    options: ["waitlist", "hold", "manual", "global_payouts"],
  },
  {
    key: "bonusPartialRefund",
    label: "Partial refund of first payment: bonus (D18)",
    options: ["full", "proportional"],
  },
  {
    key: "annualAfterMonthly",
    label: "Annual after monthly months (D24)",
    options: ["pro_rata_remaining", "none"],
  },
  {
    key: "lateCodeEntry",
    label: "Adding a code after set-up (D6)",
    options: ["never", "until_first_paid_invoice", "window_only"],
  },
  {
    key: "bonusDedupeScope",
    label: "Once-ever bonus per (D7)",
    options: ["owner_identity", "business"],
  },
  {
    key: "strongMatchAction",
    label: "Strong identity matches (D20)",
    options: ["auto_reject_with_override", "review"],
  },
  {
    key: "clawbackMethod",
    label: "Clawbacks (D11)",
    options: ["offset_only", "offset_then_reversal"],
  },
  {
    key: "postStopSignupCounts",
    label: "11.2(b): sign-up before stop, pays within 60 days counts (D22)",
  },
  {
    key: "postStopResumeCounts",
    label: "After stop, a host who misses a month and resumes still counts (D25)",
  },
  { key: "qpReplacedAfterReversal", label: "A fully refunded first payment can be replaced (D26)" },
  { key: "requirePhoneOtp", label: "Require a phone check for hosts (D9)" },
  { key: "hostCanBePartner", label: "Hosts can be Commission Partners (D13)" },
  { key: "stripePlatformProfileConfirmed", label: "Stripe confirmed the platform profile (D1)" },
  { key: "globalPayoutsEnabled", label: "Global Payouts (D2, also needs env flags)" },
  { key: "ipHashRetentionDays", label: "Keep IP and device hashes, days (D21)" },
];

function Settings({ config, refresh }: { config: PartnerConfig; refresh: () => void }) {
  const save = useServerFn(saveProgrammeSettings);
  const { busy, run } = useAction();
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...config }));
  const dirty = useMemo(
    () => EDITABLE.some((e) => draft[e.key] !== config[e.key]),
    [draft, config],
  );
  return (
    <Section
      title="Programme decisions"
      action={
        <Button
          size="sm"
          disabled={!dirty || !!busy}
          onClick={() =>
            run(
              "settings",
              async () => {
                await save({ data: { settings: draft } });
                refresh();
              },
              "Saved",
            )
          }
        >
          Save
        </Button>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {EDITABLE.map((e) => {
          const v = draft[e.key];
          const changedFromDefault = v !== PARTNER_DEFAULTS[e.key];
          return (
            <label
              key={e.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <span>
                {e.label}
                {changedFromDefault ? (
                  <span className="block text-xs text-accent">Changed from the default</span>
                ) : null}
              </span>
              {typeof PARTNER_DEFAULTS[e.key] === "boolean" ? (
                <Switch
                  checked={!!v}
                  onCheckedChange={(x) => setDraft((dd) => ({ ...dd, [e.key]: x }))}
                />
              ) : e.options ? (
                <select
                  className="h-9 rounded-lg border border-input bg-background px-2"
                  value={String(v)}
                  onChange={(ev) => setDraft((dd) => ({ ...dd, [e.key]: ev.target.value }))}
                >
                  {e.options.map((o) => (
                    <option key={o} value={o}>
                      {o.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type="number"
                  className="h-9 w-24"
                  value={String(v)}
                  onChange={(ev) => setDraft((dd) => ({ ...dd, [e.key]: Number(ev.target.value) }))}
                />
              )}
            </label>
          );
        })}
      </div>
    </Section>
  );
}
