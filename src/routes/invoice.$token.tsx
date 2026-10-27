import { createFileRoute } from "@tanstack/react-router";
import { LogoMark } from "@/components/theme/LogoMark";
import type { LogoPreset } from "@/lib/theme";
import { Download, Mail } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { invoiceCopy as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { getInvoice } from "@/lib/invoice.functions";
import { formatMoney } from "@/lib/invoice";

export const Route = createFileRoute("/invoice/$token")({
  loader: ({ params }) => getInvoice({ data: { token: params.token } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title:
          loaderData && loaderData.found
            ? `${loaderData.invoice.title} ${loaderData.invoice.number} — ${loaderData.invoice.seller_name}`
            : copy.pageTitle,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.notFound} />
    </GuestFrame>
  ),
  component: InvoicePage,
});

/**
 * A printable invoice behind its private link. "Download PDF" opens the
 * browser's print window, where Save as PDF keeps every name and alphabet
 * exactly as typed.
 */
function InvoicePage() {
  const res = Route.useLoaderData();
  if (!res.found) {
    return (
      <GuestFrame>
        <GuestMessage text={copy.notFound} />
      </GuestFrame>
    );
  }
  const i = res.invoice;
  const header = res.header;
  const money = (p: number) => formatMoney(p, i.currency);
  // One line per night when the invoice was made that way; older ones have a single line.
  const lines = Array.isArray((i as { lines?: unknown }).lines)
    ? (
        i as unknown as {
          lines: Array<{ date: string; description: string; amount_pence: number }>;
        }
      ).lines
    : [];
  const url = typeof window === "undefined" ? "" : window.location.href;
  const mail = `mailto:${encodeURIComponent(i.buyer_email ?? "")}?subject=${encodeURIComponent(
    copy.emailSubject(i.number, i.seller_name),
  )}&body=${encodeURIComponent(copy.emailBody(url))}`;

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-6 print:bg-white print:p-0">
      {/* Paper margins for Save as PDF. */}
      <style>{"@page { margin: 16mm; }"}</style>
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-end gap-2 print:hidden">
        <p className="mr-auto text-sm text-muted-foreground">{copy.downloadHint}</p>
        <Button variant="outline" asChild>
          <a href={mail}>
            <Mail className="size-4" /> {copy.emailIt}
          </a>
        </Button>
        <Button onClick={() => window.print()}>
          <Download className="size-4" /> {copy.download}
        </Button>
      </div>

      <article className="mx-auto max-w-3xl rounded-2xl bg-white p-8 text-[#1d1d1b] shadow-soft sm:p-12 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-black/10 pb-6">
          <div>
            {header ? (
              <div className="mb-3 flex items-center gap-3">
                <LogoMark
                  theme={{ logoUrl: header.logoUrl, logoPreset: header.logoPreset as LogoPreset }}
                  name={header.name}
                  className="size-12"
                />
                {header.name !== i.seller_name ? (
                  <span className="font-display text-xl">{header.name}</span>
                ) : null}
              </div>
            ) : null}
            <h1 className="font-display text-2xl">{i.seller_name}</h1>
            {i.seller_address ? (
              <p className="mt-1 whitespace-pre-line text-sm text-black/70">{i.seller_address}</p>
            ) : null}
            {i.seller_tax_number ? (
              <p className="mt-2 text-sm">
                {i.seller_tax_label}: {i.seller_tax_number}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tracking-tight">{i.title}</p>
            <dl className="mt-2 text-sm">
              <div>
                <dt className="inline text-black/60">{copy.number}: </dt>
                <dd className="inline font-medium">{i.number}</dd>
              </div>
              <div>
                <dt className="inline text-black/60">{copy.date}: </dt>
                <dd className="inline">{formatUkDate(i.issued_on, { withYear: true })}</dd>
              </div>
              {i.amended_at ? (
                <div className="text-black/60">
                  {copy.amended(formatUkDate(i.amended_at.slice(0, 10), { withYear: true }))}
                </div>
              ) : null}
            </dl>
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-black/60">
              {copy.billedTo}
            </h2>
            <p className="mt-1 font-medium">{i.buyer_name}</p>
            {i.buyer_address ? (
              <p className="whitespace-pre-line text-sm">{i.buyer_address}</p>
            ) : null}
            {i.buyer_email ? <p className="text-sm">{i.buyer_email}</p> : null}
          </div>
          <div className="sm:text-right">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-black/60">
              {copy.stay}
            </h2>
            {i.seller_room ? <p className="mt-1 font-medium">{i.seller_room}</p> : null}
            {i.check_in_date && i.check_out_date ? (
              <p className="text-sm">
                {formatUkDate(i.check_in_date, { withYear: true })} –{" "}
                {formatUkDate(i.check_out_date, { withYear: true })}
              </p>
            ) : null}
          </div>
        </section>

        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-black/60">
            <tr>
              <th className="py-2 font-semibold">{copy.item}</th>
              <th className="py-2 text-right font-semibold">{copy.amount}</th>
            </tr>
          </thead>
          <tbody>
            {lines.length ? (
              lines.map((l) => (
                <tr key={l.date} className="border-b border-black/10">
                  <td className="py-2.5 pr-4">{l.description}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(l.amount_pence)}</td>
                </tr>
              ))
            ) : (
              <tr className="border-b border-black/10">
                <td className="py-3 pr-4">{i.description}</td>
                <td className="py-3 text-right tabular-nums">{money(i.net_pence)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          {i.tax_pence > 0 || lines.length > 1 ? (
            <div className="flex justify-between">
              <dt className="text-black/60">{copy.subtotal}</dt>
              <dd className="tabular-nums">{money(i.net_pence)}</dd>
            </div>
          ) : null}
          {i.tax_pence > 0 ? (
            <>
              <div className="flex justify-between">
                <dt className="text-black/60">
                  {copy.taxLine(i.tax_name ?? "Tax", (i.tax_rate_bp / 100).toString())}
                </dt>
                <dd className="tabular-nums">{money(i.tax_pence)}</dd>
              </div>
            </>
          ) : null}
          <div className="flex justify-between border-t border-black/10 pt-2 text-base font-semibold">
            <dt>{copy.total}</dt>
            <dd className="tabular-nums">{money(i.total_pence)}</dd>
          </div>
        </dl>

        <p className="mt-10 text-sm text-black/60">{copy.paidNote}</p>
      </article>
    </div>
  );
}
