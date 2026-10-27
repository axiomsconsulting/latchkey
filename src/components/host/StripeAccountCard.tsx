import { Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { stripeAccountCopy as copy } from "@/content/copy";
import { stripeDashboardUrl, type StripeIdentity } from "@/lib/stripe-identity";

/**
 * Which Stripe account this is, in the words Stripe uses: name, account ID
 * (copyable, the one to compare in Stripe), email, country and currency,
 * statement name, live or test, and whether it can take and pay out
 * payments. Shared by the host's card payments panel and Latchkey admin.
 */
export function StripeAccountCard({
  identity,
  title,
  checkedAt,
  onCheck,
  checking,
  linkKind,
  admin,
}: {
  identity: StripeIdentity | null;
  title: string;
  checkedAt?: string | null;
  onCheck?: () => void;
  checking?: boolean;
  /** "connected": open it from Latchkey's Connect list; "own": the account's own settings page. */
  linkKind: "connected" | "own";
  admin?: boolean;
}) {
  if (!identity) {
    return (
      <div className="rounded-xl border border-border p-3 text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{copy.unreachable}</p>
        {onCheck ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={checking}
            onClick={onCheck}
          >
            {checking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}{" "}
            {copy.checkNow}
          </Button>
        ) : null}
      </div>
    );
  }
  const copyId = () =>
    void navigator.clipboard.writeText(identity.id).then(
      () => toast.success(copy.copied),
      () => undefined,
    );
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
  return (
    <div className="rounded-xl border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <Badge variant={identity.live ? "outline" : "secondary"}>
          {identity.live ? copy.live : copy.test}
        </Badge>
      </div>
      <dl className="mt-1 divide-y divide-border">
        {row(copy.name, identity.name ?? "—")}
        {row(
          copy.accountId,
          <span className="flex items-center gap-1">
            <span className="min-w-0 break-all font-mono">{identity.id}</span>
            <button
              type="button"
              onClick={copyId}
              aria-label={copy.copyId}
              className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-secondary"
            >
              <Copy className="size-3.5" />
            </button>
          </span>,
        )}
        {identity.email ? row(copy.email, identity.email) : null}
        {identity.country || identity.currency
          ? row(copy.country, [identity.country, identity.currency].filter(Boolean).join(" · "))
          : null}
        {identity.statement
          ? row(copy.statement, <span className="font-mono">{identity.statement}</span>)
          : null}
        {row(
          copy.status,
          `${identity.charges ? copy.charges : copy.noCharges} · ${identity.payouts ? copy.payouts : copy.noPayouts}`,
        )}
      </dl>
      {checkedAt ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {copy.checked(
            new Date(checkedAt).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
          )}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {onCheck ? (
          <Button size="sm" variant="outline" disabled={checking} onClick={onCheck}>
            {checking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}{" "}
            {copy.checkNow}
          </Button>
        ) : null}
        <Button asChild size="sm" variant="ghost">
          <a
            href={stripeDashboardUrl(linkKind, identity.id, identity.live)}
            target="_blank"
            rel="noreferrer"
          >
            {copy.openStripe} <ExternalLink className="size-4" />
          </a>
        </Button>
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">{copy.howTitle}</summary>
        <p className="mt-1">{admin ? copy.howAdmin : copy.how}</p>
      </details>
    </div>
  );
}
