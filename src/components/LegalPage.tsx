import { Link } from "@tanstack/react-router";

import { SiteHeader } from "@/components/SiteHeader";
import { legalPageCopy as copy } from "@/content/copy";
import type { LegalDoc } from "@/content/legal";
import { formatUkDate } from "@/lib/dates";
import { LEGAL_UPDATED } from "@/lib/legal";

/**
 * /terms and /privacy: a contents list, numbered sections with anchors
 * (#section-id), the date the wording last changed, and links between the
 * two. `extra` adds something inside a section (the statistics switch).
 */
export function LegalPage({
  doc,
  extra,
}: {
  doc: LegalDoc;
  extra?: Record<string, React.ReactNode>;
}) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-5 pb-12 pt-6">
        <header className="space-y-3">
          <h1 className="text-4xl">{doc.title}</h1>
          <p className="text-sm text-muted-foreground">
            {copy.updated(formatUkDate(LEGAL_UPDATED, { withYear: true }))}
          </p>
          {doc.intro.map((p) => (
            <p key={p} className="text-lg text-muted-foreground">
              {p}
            </p>
          ))}
        </header>

        <nav aria-label={copy.contents} className="card-soft p-5 print:hidden">
          <p className="mb-2 font-medium">{copy.contents}</p>
          <ol className="grid list-decimal gap-x-8 gap-y-1 pl-5 text-sm sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-primary underline-offset-2 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {doc.sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            className="scroll-mt-24 space-y-2"
            aria-labelledby={`${s.id}-title`}
          >
            <h2 id={`${s.id}-title`} className="text-xl">
              <span className="text-muted-foreground">{i + 1}.</span> {s.title}
            </h2>
            {s.body?.map((p) => (
              <p key={p} className="leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
            {s.points?.length ? (
              <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-muted-foreground">
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            {extra?.[s.id] ?? null}
          </section>
        ))}
      </main>
      <LegalFooter />
    </div>
  );
}

/** Links to the legal pages, for page footers. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label={copy.legalNav} className={className ?? "flex flex-wrap gap-x-4 gap-y-1"}>
      <Link to="/terms" className="underline-offset-2 hover:underline">
        {copy.terms}
      </Link>
      <Link to="/privacy" className="underline-offset-2 hover:underline">
        {copy.privacy}
      </Link>
      <a href="/privacy#statistics" className="underline-offset-2 hover:underline">
        {copy.statistics}
      </a>
    </nav>
  );
}

/** "By continuing you agree to the Terms of service and Privacy policy." under sign-up buttons. */
export function AgreeNote({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-xs text-muted-foreground"}>
      {copy.agree}{" "}
      <Link to="/terms" target="_blank" className="underline underline-offset-2">
        {copy.terms}
      </Link>{" "}
      {copy.and}{" "}
      <Link to="/privacy" target="_blank" className="underline underline-offset-2">
        {copy.privacy}
      </Link>
      .
    </p>
  );
}

function LegalFooter() {
  return (
    <footer className="border-t border-border px-5 pb-28 pt-8 sm:pb-8 print:hidden">
      <div className="mx-auto flex max-w-3xl flex-wrap justify-between gap-3 text-sm text-muted-foreground">
        <Link to="/" search={{ home: true }} className="underline-offset-2 hover:underline">
          {copy.home}
        </Link>
        <LegalLinks />
      </div>
    </footer>
  );
}
