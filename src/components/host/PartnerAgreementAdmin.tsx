/* eslint-disable @typescript-eslint/no-explicit-any -- the 0062 tables aren't in the generated types yet */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Eye, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ukDate, ukDateTime } from "@/lib/partner-agreement";
import { adminAgreementOverview, publishAgreementVersion } from "@/lib/partner-agreement.functions";
import { ID_FAIL_WORDS } from "@/lib/partner-id";
import {
  adminPartnerIdChecks,
  decidePartnerIdCheck,
  viewPartnerIdImages,
} from "@/lib/partner-id.functions";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The agreement in force, whether signing is open (and why not), versions, and publishing a new one (19.1). */
export function AgreementAdmin() {
  const load = useServerFn(adminAgreementOverview);
  const publish = useServerFn(publishAgreementVersion);
  const q = useQuery({ queryKey: ["admin-agreement"], queryFn: () => load() });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ version: "", body: "", effective: "", reduces: false, notice: "" });
  const [busy, setBusy] = useState(false);
  const d = q.data;
  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (!d?.setUp) return null;
  return (
    <section className="card-soft space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">Agreement and signing</h2>
        <Badge variant={d.signingOpen ? "secondary" : "destructive"}>
          {d.signingOpen ? "Signing open" : "Signing closed"}
        </Badge>
      </div>
      {d.problems.length ? (
        <ul className="space-y-1 text-sm text-destructive">
          {d.problems.map((p: string) => (
            <li key={p} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="divide-y divide-border text-sm">
        {d.versions.map((v: any) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="font-medium">v{v.version}</span>
            <Badge variant={v.status === "current" ? "secondary" : "outline"}>{v.status}</Badge>
            <span className="text-muted-foreground">
              {v.effective_from ? `in force from ${ukDate(v.effective_from)}` : "not published"} ·{" "}
              {String(v.body_sha256).slice(0, 12)}
            </span>
            <a
              className="ml-auto text-primary underline"
              href="/partners/agreement"
              target="_blank"
              rel="noopener"
            >
              Read
            </a>
          </li>
        ))}
      </ul>
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-sm font-medium">Publish a new version</summary>
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await publish({
                data: {
                  version: f.version,
                  bodyMarkdown: f.body,
                  effectiveFrom: new Date(f.effective).toISOString(),
                  reducesTerms: f.reduces,
                  noticeSentAt: f.notice ? new Date(f.notice).toISOString() : null,
                },
              });
              toast.success("Published. Partners will be asked to accept it once it's in force.");
              setF({ version: "", body: "", effective: "", reduces: false, notice: "" });
              void q.refetch();
            } catch (err) {
              toast.error(errText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-xs text-muted-foreground">
            Paste the full text (Markdown, with the same {"{{placeholders}}"}). Published text can
            never be changed. A version that reduces partners' terms needs 30 days' notice (clause
            19.1); until a partner accepts it, their code stops creating new referrals once it's in
            force (19.4).
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="av">Version (e.g. 1.1)</Label>
              <Input
                id="av"
                value={f.version}
                onChange={(e) => setF({ ...f, version: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ae">In force from</Label>
              <Input
                id="ae"
                type="datetime-local"
                value={f.effective}
                onChange={(e) => setF({ ...f, effective: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="an">Notice sent on</Label>
              <Input
                id="an"
                type="datetime-local"
                value={f.notice}
                onChange={(e) => setF({ ...f, notice: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.reduces} onCheckedChange={(v) => setF({ ...f, reduces: v })} /> This
            version reduces partners' terms
          </label>
          <Textarea
            rows={8}
            value={f.body}
            onChange={(e) => setF({ ...f, body: e.target.value })}
            placeholder="# Latchkey Commission Partner Agreement…"
          />
          <Button
            type="submit"
            disabled={busy || !/^\d+\.\d+$/.test(f.version) || f.body.length < 1000 || !f.effective}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Publish
          </Button>
        </form>
      </details>
    </section>
  );
}

/** Identity checks waiting for a person (3.4), with photos behind a logged reason (17.1). */
export function IdReviewAdmin({ partnerName }: { partnerName: (id: string) => string }) {
  const load = useServerFn(adminPartnerIdChecks);
  const view = useServerFn(viewPartnerIdImages);
  const decide = useServerFn(decidePartnerIdCheck);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-id-checks"], queryFn: () => load() });
  const [reason, setReason] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<
    Record<string, { id: string | null; selfie: string | null }>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const d = q.data;
  if (!d?.setUp) return null;
  const waiting = d.checks.filter(
    (c: any) => c.status === "manual_review" || c.status === "auto_passed",
  );
  const recent = d.checks
    .filter((c: any) => c.status === "approved" || c.status === "rejected")
    .slice(0, 10);
  const act = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="card-soft space-y-3 p-5">
      <h2 className="text-lg">Identity checks to review ({waiting.length})</h2>
      {waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing waiting.</p>
      ) : null}
      <ul className="divide-y divide-border">
        {waiting.map((c: any) => (
          <li key={c.id} className="space-y-2 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{partnerName(c.partner_id)}</span>
              <Badge variant="outline">
                {c.status === "auto_passed" ? "passed automatically" : "needs a person"}
              </Badge>
              <Badge variant={c.name_match === "matched" ? "secondary" : "destructive"}>
                name {c.name_match ?? "not read"}
              </Badge>
              <span className="text-muted-foreground">
                attempt {c.attempt} · {ukDateTime(c.created_at)}
              </span>
            </div>
            <p className="text-muted-foreground">
              {[
                c.doc_type?.replace(/_/g, " "),
                c.issuing_country,
                c.name_on_doc ? `name "${c.name_on_doc}"` : null,
                c.date_of_birth ? `born ${c.date_of_birth}` : null,
                c.expiry_date ? `expires ${c.expiry_date}` : null,
                c.doc_last4 ? `number …${c.doc_last4}` : null,
                c.homemade_or_screen ? "looks like a copy or a screen" : null,
                c.expired ? "expired" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Nothing could be read."}
              {c.fail_reason ? ` (${ID_FAIL_WORDS[c.fail_reason] ?? c.fail_reason})` : ""}
            </p>
            {c.hasImages ? (
              photos[c.id] ? (
                <div className="grid max-w-xl grid-cols-2 gap-2">
                  {photos[c.id]!.id ? (
                    <img
                      src={photos[c.id]!.id!}
                      alt="ID document"
                      className="rounded-lg border border-border"
                    />
                  ) : null}
                  {photos[c.id]!.selfie ? (
                    <img
                      src={photos[c.id]!.selfie!}
                      alt="Selfie"
                      className="rounded-lg border border-border"
                    />
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-9 w-64"
                    placeholder="Reason for viewing (logged)"
                    value={reason[c.id] ?? ""}
                    onChange={(e) => setReason((r) => ({ ...r, [c.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null || (reason[c.id] ?? "").trim().length < 3}
                    onClick={() =>
                      act(`v${c.id}`, async () => {
                        const links = await view({
                          data: { checkId: c.id, reason: reason[c.id]! },
                        });
                        setPhotos((p) => ({ ...p, [c.id]: links }));
                      })
                    }
                  >
                    <Eye className="size-4" /> View photos (10 minutes)
                  </Button>
                </div>
              )
            ) : (
              <p className="text-xs text-muted-foreground">No photos kept.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-9 w-64"
                placeholder="Decision note (required)"
                value={note[c.id] ?? ""}
                onChange={(e) => setNote((n) => ({ ...n, [c.id]: e.target.value }))}
              />
              {(["approved", "rejected"] as const).map((decision) => (
                <Button
                  key={decision}
                  size="sm"
                  variant={decision === "approved" ? "default" : "destructive"}
                  disabled={busy !== null || (note[c.id] ?? "").trim().length < 3}
                  onClick={() =>
                    act(
                      `${decision}${c.id}`,
                      async () => {
                        await decide({ data: { checkId: c.id, decision, note: note[c.id]! } });
                        await qc.invalidateQueries({ queryKey: ["admin-id-checks"] });
                        await qc.invalidateQueries({ queryKey: ["admin-partners"] });
                      },
                      decision === "approved" ? "Identity approved" : "Identity rejected",
                    )
                  }
                >
                  {decision === "approved" ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <XCircle className="size-4" />
                  )}{" "}
                  {decision === "approved" ? "Approve" : "Reject"}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {recent.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Recent decisions</summary>
          <ul className="mt-2 space-y-1">
            {recent.map((c: any) => (
              <li key={c.id}>
                {partnerName(c.partner_id)}: {c.status} {c.reviewed_at ? ukDate(c.reviewed_at) : ""}
                {c.images_deleted_at
                  ? " · photos deleted"
                  : c.hasImages
                    ? " · photos kept until 30 days after the decision"
                    : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
