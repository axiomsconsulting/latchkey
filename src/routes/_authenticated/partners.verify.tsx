import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { IdCamera } from "@/components/guest/IdCamera";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { partnerCopy as copy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { myPartnerSteps } from "@/lib/partner-agreement.functions";
import { ID_CONSENT } from "@/lib/partner-id";
import { submitPartnerId } from "@/lib/partner-id.functions";

/** The partner's identity check (agreement 3.4): consent, a photo of their ID, a selfie. */
export const Route = createFileRoute("/_authenticated/partners/verify")({
  head: () => ({
    meta: [{ title: rebrand("Verify your identity · Latchkey Commission Partners") }],
  }),
  component: VerifyPage,
});

type Stage = "consent" | "id" | "selfie" | "sending" | "result";

function VerifyPage() {
  const stepsFn = useServerFn(myPartnerSteps);
  const steps = useQuery({ queryKey: ["partner-steps"], queryFn: () => stepsFn() });
  const s = steps.data;
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-xl space-y-6 px-4 pb-32 pt-4 sm:px-5 md:pb-16">
        <h1 className="flex items-center gap-2 text-3xl">
          <ShieldCheck className="size-7 text-primary" /> {copy.verifyTitle}
        </h1>
        {steps.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
        {s && !s.partner ? (
          <Button asChild>
            <Link to="/partners/join">{copy.signApplyFirst}</Link>
          </Button>
        ) : null}
        {s?.partner && !s.agreement ? (
          <div className="card-soft space-y-3 p-5">
            <p>{copy.verifySignFirst}</p>
            <Button asChild>
              <Link to="/partners/agreement">{copy.readAgreement}</Link>
            </Button>
          </div>
        ) : null}
        {s?.partner && s.agreement ? (
          s.idCheckStatus === "approved" ? (
            <p className="card-soft flex items-center gap-2 p-5">
              <CheckCircle2 className="size-5 text-primary" /> {copy.verifyApproved}
            </p>
          ) : s.idCheckStatus === "pending" || s.idCheckStatus === "manual_review" ? (
            <p className="card-soft p-5">{copy.verifyWaiting}</p>
          ) : (
            <Capture rejected={s.idCheckStatus === "rejected"} />
          )
        ) : null}
        {s?.partner ? (
          <Link to="/partners" className="text-sm text-primary underline">
            {copy.accountTitle}
          </Link>
        ) : null}
      </main>
    </div>
  );
}

function Capture({ rejected }: { rejected: boolean }) {
  const submit = useServerFn(submitPartnerId);
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>("consent");
  const [id, setId] = useState<{ full: string; small: string } | null>(null);
  const [result, setResult] = useState<{
    message: string | null;
    again: boolean;
    left: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(selfie: string) {
    if (!id) return;
    setStage("sending");
    setError(null);
    try {
      const r = await submit({
        data: { consent: true, idFull: id.full, idSmall: id.small, selfie },
      });
      setResult({
        message: r.message,
        again: r.status === "try_again",
        left: "attemptsLeft" in r ? (r.attemptsLeft ?? 0) : 0,
      });
      setStage("result");
      await qc.invalidateQueries({ queryKey: ["partner-steps"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("consent");
    }
  }

  if (stage === "consent")
    return (
      <div className="card-soft space-y-4 p-5">
        {rejected ? <p className="text-sm text-destructive">{copy.verifyRejected}</p> : null}
        <p className="leading-relaxed">{ID_CONSENT}</p>
        <a
          href="/privacy#partners"
          className="text-sm text-primary underline"
          target="_blank"
          rel="noopener"
        >
          {copy.verifyPrivacyLink}
        </a>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button size="lg" className="w-full" onClick={() => setStage("id")}>
          {copy.verifyContinue}
        </Button>
      </div>
    );
  if (stage === "id")
    return (
      <div className="space-y-3">
        <h2 className="text-xl">{copy.verifyIdStep}</h2>
        <IdCamera
          busy={false}
          help={copy.verifyIdHelp}
          onCapture={(full, small) => {
            setId({ full, small });
            setStage("selfie");
          }}
          onFail={() => {
            setError(copy.verifyNoCamera);
            setStage("consent");
          }}
        />
      </div>
    );
  if (stage === "selfie" || stage === "sending")
    return (
      <div className="space-y-3">
        <h2 className="text-xl">{copy.verifySelfieStep}</h2>
        <IdCamera
          facing="user"
          busy={stage === "sending"}
          busyLabel={copy.verifyChecking}
          help={copy.verifySelfieHelp}
          onCapture={(_full, small) => void send(small)}
          onFail={() => {
            setError(copy.verifyNoCamera);
            setStage("consent");
          }}
        />
      </div>
    );
  return (
    <div className="card-soft space-y-3 p-5">
      {result?.message ? <p>{result.message}</p> : null}
      {result?.again ? (
        <>
          <p className="text-sm text-muted-foreground">{copy.verifyAttemptsLeft(result.left)}</p>
          <Button
            onClick={() => {
              setId(null);
              setResult(null);
              setStage("id");
            }}
          >
            {copy.verifyTryAgain}
          </Button>
        </>
      ) : (
        <p>{copy.verifyWaiting}</p>
      )}
    </div>
  );
}
