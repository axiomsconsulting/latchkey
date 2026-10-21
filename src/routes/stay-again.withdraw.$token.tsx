import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";

import { GuestFrame } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { stayAgainCopy as copy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { withdrawContact } from "@/lib/direct.functions";

/**
 * Stop hearing from a business about future stays. It waits for a tap
 * (never on page load), so a mail scanner opening the link can't withdraw
 * someone by accident.
 */
export const Route = createFileRoute("/stay-again/withdraw/$token")({
  head: () => ({ meta: [{ title: rebrand("Stop hearing about future stays — Latchkey") }, { name: "robots", content: "noindex" }] }),
  component: Withdraw,
});

function Withdraw() {
  const { token } = Route.useParams();
  const run = useServerFn(withdrawContact);
  const [state, setState] = useState<"ask" | "busy" | "done" | "bad">(/^[0-9a-f]{32,80}$/.test(token) ? "ask" : "bad");
  return (
    <GuestFrame>
      <main className="mx-auto max-w-xl py-16">
        <section className="card-soft space-y-4 p-8 text-center">
          {state === "done" ? (
            <>
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-7" /></span>
              <h1 className="text-2xl">{copy.withdrawnTitle}</h1>
              <p className="text-muted-foreground">{copy.withdrawnBody}</p>
            </>
          ) : state === "bad" ? (
            <p className="text-lg">{copy.badLink}</p>
          ) : (
            <>
              <h1 className="text-2xl">{copy.withdrawTitle}</h1>
              <p className="text-muted-foreground">{copy.withdrawBody}</p>
              <Button
                size="lg"
                disabled={state === "busy"}
                onClick={async () => {
                  setState("busy");
                  await run({ data: { token } }).catch(() => undefined);
                  setState("done");
                }}
              >
                {state === "busy" ? <Loader2 className="animate-spin" /> : null} {copy.withdrawButton}
              </Button>
            </>
          )}
        </section>
      </main>
    </GuestFrame>
  );
}
