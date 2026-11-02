import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { StayTermsForm } from "@/components/guest/StayTermsForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stayTermsCopy as copy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { addressProblem, allTicked, emptyAnswers, type TermsAnswers } from "@/lib/stay-terms";
import { getAgreementLink, signAgreementLink } from "@/lib/stay-terms.functions";

/**
 * /agree/<link>: a guest reads and agrees to the terms for a stay their host
 * booked another way (a request, an extension, a booking by phone), and
 * signs the longer-stay licence when the stay is long enough. The text
 * comes from the server word for word, and is kept with the signing record.
 */
export const Route = createFileRoute("/agree/$token")({
  head: () => ({
    meta: [
      { title: rebrand("Your stay terms · Latchkey") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgreePage,
});

type Page = Awaited<ReturnType<typeof getAgreementLink>>;

function AgreePage() {
  const { token } = Route.useParams();
  const getFn = useServerFn(getAgreementLink);
  const signFn = useServerFn(signAgreementLink);
  const [page, setPage] = useState<Page | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [answers, setAnswers] = useState<TermsAnswers | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const input = {
    token,
    ...(name !== null ? { name } : {}),
    ...(answers?.homeAddress.line1.trim() ? { homeAddress: answers.homeAddress } : {}),
    ...(answers?.purpose ? { purpose: answers.purpose } : {}),
  };
  const key = JSON.stringify(input);
  useEffect(() => {
    const id = window.setTimeout(
      () =>
        void getFn({ data: input })
          .then((p) => {
            setPage(p);
            if (p.found) {
              setName((n) => n ?? p.guestName);
              setAnswers((a) => a ?? emptyAnswers(p.country));
            }
          })
          .catch(() => setPage({ found: false })),
      page ? 500 : 0,
    );
    return () => window.clearTimeout(id);
    // Each change to what the terms say.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!page)
    return (
      <GuestFrame>
        <div className="grid place-items-center py-24">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </GuestFrame>
    );
  if (!page.found)
    return (
      <GuestFrame>
        <GuestMessage text={copy.pageGone} />
      </GuestFrame>
    );

  async function sign() {
    if (!page?.found || !answers || name === null) return;
    const home = addressProblem(answers.homeAddress);
    const why =
      name.trim().length < 2
        ? copy.needSign
        : !allTicked(!!page.licenceText, answers.ticks)
          ? copy.needTicks
          : page.licenceText && (home || !answers.purpose)
            ? (home ?? copy.needHome)
            : page.licenceText && (answers.typedName.trim().length < 2 || !answers.signature)
              ? copy.needSign
              : null;
    if (why) return setError(why);
    setBusy(true);
    setError(null);
    try {
      await signFn({
        data: {
          token,
          name: name.trim(),
          agreed: {
            termsSha: page.termsSha,
            ticks: answers.ticks,
            licence:
              page.licenceText && page.licenceSha && answers.purpose && answers.signature
                ? {
                    sha: page.licenceSha,
                    homeAddress: answers.homeAddress,
                    purpose: answers.purpose,
                    typedName: answers.typedName.trim(),
                    signature: answers.signature,
                  }
                : null,
          },
        },
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.pageGone);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GuestFrame theme={page.theme} name={page.property}>
      <main className="mx-auto max-w-2xl space-y-5 py-8">
        <h1 className="text-3xl">{copy.pageTitle(page.property)}</h1>
        {done || page.signed ? (
          <div className="card-soft space-y-3 p-8 text-center">
            <CheckCircle2 className="mx-auto size-12 text-primary" aria-hidden />
            <p className="text-lg">{copy.pageDone}</p>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground">{copy.pageIntro}</p>
            <div className="space-y-1">
              <Label htmlFor="agree-name">{copy.typedName}</Label>
              <Input
                id="agree-name"
                autoComplete="name"
                value={name ?? ""}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {answers ? (
              <StayTermsForm
                termsText={page.termsText}
                licenceText={page.licenceText}
                value={answers}
                onChange={setAnswers}
              />
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button size="lg" className="w-full" disabled={busy} onClick={() => void sign()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {page.licenceText ? copy.pageSign : copy.pageAgree}
            </Button>
          </>
        )}
      </main>
    </GuestFrame>
  );
}
