import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Copy, ExternalLink, LifeBuoy, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorReportCopy as copy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import { errorText, type AppError } from "@/lib/app-error";
import { sendFeedback } from "@/lib/feedback.functions";

/**
 * An error the host can act on, in place of a toast: what happened in plain
 * words, numbered next steps, the technical details folded away, Copy, and
 * Send to Latchkey support (a bug report in the super admin's Feedback inbox
 * with the details, business and page).
 */
export function ErrorReport({ error, onClose }: { error: AppError; onClose?: () => void }) {
  const ws = useWorkspace();
  const send = useServerFn(sendFeedback);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [at] = useState(() => new Date());
  const hostId = ws.data?.hostId ?? null;
  const business = (ws.data?.host as { business_name?: string | null } | null | undefined)?.business_name ?? null;
  const page = typeof window === "undefined" ? null : window.location.pathname + window.location.search;
  const text = errorText(error, { page, business, at });

  async function report() {
    setState("sending");
    try {
      await send({ data: { kind: "bug", rating: null, message: text.slice(0, 2000), hostId, page: page?.slice(0, 300) ?? null } });
      setState("sent");
    } catch {
      setState("idle");
      toast.error(copy.sendFailed);
    }
  }

  return (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-base font-semibold">{error.title}</p>
          <p>{error.body}</p>
          {error.steps.length ? (
            <div>
              <p className="font-medium">{copy.nextSteps}</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                {error.steps.map((s) => (
                  <li key={s.text}>
                    {s.text}
                    {s.href ? (
                      <>
                        {" "}
                        <a href={s.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
                          {copy.open} <ExternalLink className="size-3.5" />
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {error.detail ? (
            <details>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{copy.details}</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-2 font-mono text-xs">{error.detail}</pre>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success(copy.copied), () => undefined)}>
              <Copy className="size-4" /> {copy.copy}
            </Button>
            {error.support ? (
              state === "sent" ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                  <Check className="size-4" /> {copy.sent}
                </span>
              ) : (
                <Button size="sm" variant="outline" disabled={state === "sending"} onClick={() => void report()}>
                  {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : <LifeBuoy className="size-4" />} {copy.send}
                </Button>
              )
            ) : null}
          </div>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label={copy.close} className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-background">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
