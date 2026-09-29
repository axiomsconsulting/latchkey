import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { GuestFrame } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guest as copy } from "@/content/copy";
import { resolvePin } from "@/lib/checkin.functions";

export const Route = createFileRoute("/checkin")({
  head: () => ({
    meta: [
      { title: "Guest check-in — Latchkey" },
      { name: "description", content: "Enter your property's 6-digit PIN to check yourself in." },
      { property: "og:title", content: "Guest check-in — Latchkey" },
      { property: "og:description", content: "Enter your property's PIN to check yourself in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PinEntry,
});

function PinEntry() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolve = useServerFn(resolvePin);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await resolve({ data: { pin } });
      if (res.code) await navigate({ to: "/p/$code", params: { code: res.code } });
      else setError(copy.pinWrong);
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GuestFrame>
      <main className="mx-auto max-w-lg py-12">
        <form onSubmit={submit} className="card-soft space-y-5 p-8 text-center">
          <h1 className="text-3xl">{copy.pinTitle}</h1>
          <p className="text-muted-foreground">{copy.pinBody}</p>
          <Input
            aria-label={copy.pinTitle}
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="h-20 text-center text-4xl tracking-[0.5em]"
          />
          {error ? <p role="alert" className="text-destructive">{error}</p> : null}
          <Button type="submit" size="touch-xl" className="w-full" disabled={busy || pin.length !== 6}>
            {busy ? <Loader2 className="size-6 animate-spin" /> : null}
            {copy.startCta}
          </Button>
        </form>
      </main>
    </GuestFrame>
  );
}
