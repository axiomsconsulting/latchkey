import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Lock } from "lucide-react";

import { AgreementBlocks } from "@/components/partners/AgreementText";
import { SignaturePad } from "@/components/partners/SignaturePad";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { partnerCopy as copy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { rebrand } from "@/lib/brand";
import { contents, fullNameProblem, parseMarkdown, splitSigning } from "@/lib/partner-agreement";
import {
  getPartnerAgreement,
  myPartnerSteps,
  signPartnerAgreement,
} from "@/lib/partner-agreement.functions";
import { markPartnerIntent } from "@/lib/partner-intent";

/** The Commission Partner agreement: read it all (anyone can), then sign it (partners, once they've read to the end). */
export const Route = createFileRoute("/partners/agreement")({
  head: () => ({
    meta: [
      { title: rebrand("Commission Partner agreement · Latchkey") },
      {
        name: "description",
        content: rebrand("The terms of the Latchkey Commission Partner programme."),
      },
    ],
  }),
  component: AgreementPage,
});

function AgreementPage() {
  const load = useServerFn(getPartnerAgreement);
  const q = useQuery({ queryKey: ["partner-agreement"], queryFn: () => load(), retry: 1 });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void supabase.auth
      .getUser()
      .then(({ data }) => setSignedIn(!!data.user && !data.user.is_anonymous));
  }, []);
  const stepsFn = useServerFn(myPartnerSteps);
  const steps = useQuery({
    queryKey: ["partner-steps"],
    queryFn: () => stepsFn(),
    enabled: !!signedIn,
  });
  const d = q.data;
  const blocks = useMemo(() => (d?.ready ? parseMarkdown(d.rendered) : []), [d]);
  const parts = useMemo(() => splitSigning(blocks), [blocks]);
  const toc = useMemo(() => contents(blocks), [blocks]);

  // The sign section opens only once the reader reaches the end (or focuses it, for screen readers).
  const end = useRef<HTMLDivElement>(null);
  const [readToEnd, setReadToEnd] = useState(false);
  useEffect(() => {
    const el = end.current;
    if (!el || readToEnd) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setReadToEnd(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [readToEnd, blocks.length]);

  const s = steps.data;
  const needsSigning =
    !!s?.partner && (s.missing.includes("agreement") || s.missing.includes("new_version"));

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 pb-32 pt-4 sm:px-5 md:pb-16">
        {q.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
        {d && !d.ready ? <p className="card-soft p-5">{copy.notSetUp}</p> : null}
        {q.error ? <p className="card-soft p-5">{copy.agreementUnavailable}</p> : null}
        {d?.ready ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" size="sm">
                <a href="/api/public/partner-agreement" target="_blank" rel="noopener">
                  <Download className="size-4" /> {copy.agreementPdf}
                </a>
              </Button>
              <span className="text-xs text-muted-foreground">
                {copy.agreementFingerprint(d.version, d.bodySha256.slice(0, 12))}
              </span>
            </div>
            <details className="card-soft p-4 text-sm">
              <summary className="cursor-pointer font-medium">{copy.agreementContents}</summary>
              <ol className="mt-3 space-y-1">
                {toc.map((t) => (
                  <li key={t.id}>
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href={`#${t.id}`}
                    >
                      {t.text}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
            <article className="space-y-4">
              <AgreementBlocks blocks={parts.before} />
              <AgreementBlocks blocks={parts.after} />
            </article>
            <div ref={end} tabIndex={0} onFocus={() => setReadToEnd(true)} className="sr-only">
              {copy.agreementEnd}
            </div>
            <section id="sign" className="card-soft space-y-4 p-5">
              <h2 className="text-xl">{copy.signTitle}</h2>
              {!readToEnd ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="size-4" /> {copy.signLocked}
                </p>
              ) : signedIn === false ? (
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link
                      to="/auth"
                      search={{ mode: "sign_up", next: "/partners/join", for: "partner" }}
                      onClick={markPartnerIntent}
                    >
                      {copy.joinSignUp}
                    </Link>
                  </Button>
                </div>
              ) : s && !s.partner ? (
                <Button asChild>
                  <Link to="/partners/join">{copy.signApplyFirst}</Link>
                </Button>
              ) : s?.partner && !needsSigning ? (
                <p className="text-sm">{copy.signDone}</p>
              ) : !d.signingOpen ? (
                <p className="text-sm text-muted-foreground">{copy.signNotOpen}</p>
              ) : needsSigning ? (
                <SignForm ticks={d.ticks} renderedSha256={d.renderedSha256} />
              ) : (
                <Loader2 className="size-5 animate-spin" />
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function SignForm({ ticks, renderedSha256 }: { ticks: string[]; renderedSha256: string }) {
  const sign = useServerFn(signPartnerAgreement);
  const navigate = useNavigate();
  const [ticked, setTicked] = useState<boolean[]>(() => ticks.map(() => false));
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<"individual" | "company">("individual");
  const [company, setCompany] = useState({ name: "", number: "", position: "" });
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameProblem = name.trim() ? fullNameProblem(name) : null;
  const ready =
    ticked.every(Boolean) &&
    !!name.trim() &&
    !nameProblem &&
    !!png &&
    (capacity === "individual" || !!company.name.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !png) return;
    setBusy(true);
    setError(null);
    try {
      await sign({
        data: {
          renderedSha256,
          typedName: name.trim(),
          ticks: ticks.map(() => true as const),
          signaturePng: png,
          capacity,
          companyName: capacity === "company" ? company.name : undefined,
          companyNumber: capacity === "company" ? company.number || undefined : undefined,
          position: capacity === "company" ? company.position || undefined : undefined,
        },
      });
      await navigate({ to: "/partners/verify" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">{copy.signTicksTitle}</legend>
        {ticks.map((t, i) => (
          <label key={t} className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={ticked[i] ?? false}
              onCheckedChange={(v) => setTicked((x) => x.map((y, j) => (j === i ? v === true : y)))}
              className="mt-0.5"
            />
            <span>{t}</span>
          </label>
        ))}
      </fieldset>
      <div role="radiogroup" aria-label={copy.signCapacity} className="flex flex-wrap gap-2">
        {(["individual", "company"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={capacity === k}
            onClick={() => setCapacity(k)}
            className={`rounded-xl border px-4 py-2 text-sm ${capacity === k ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
          >
            {k === "individual" ? copy.signAsMe : copy.signAsCompany}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="typed-name">{copy.signName}</Label>
        <Input
          id="typed-name"
          className="h-12"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        {nameProblem ? <p className="text-sm text-destructive">{nameProblem}</p> : null}
      </div>
      {capacity === "company" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="co-name">{copy.businessName}</Label>
            <Input
              id="co-name"
              className="h-12"
              value={company.name}
              onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-number">{copy.companyNumber}</Label>
            <Input
              id="co-number"
              className="h-12"
              value={company.number}
              onChange={(e) => setCompany((c) => ({ ...c, number: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-position">{copy.signPosition}</Label>
            <Input
              id="co-position"
              className="h-12"
              value={company.position}
              onChange={(e) => setCompany((c) => ({ ...c, position: e.target.value }))}
            />
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>{copy.signDraw}</Label>
        <SignaturePad onChange={setPng} label={copy.signDraw} />
      </div>
      <p className="text-xs text-muted-foreground">{copy.signRecordNote}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!ready || busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null} {copy.signSubmit}
      </Button>
    </form>
  );
}
