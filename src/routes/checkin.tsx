import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { GuestFrame } from "@/components/guest/GuestFrame";
import { PinPad } from "@/components/guest/PinPad";
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

  async function submit(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await resolve({ data: { pin: value } });
      if (res.code) {
        await navigate({ to: "/p/$code", params: { code: res.code } });
      } else {
        setError(copy.pinWrong);
        setPin("");
      }
    } catch {
      setError(copy.error);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GuestFrame>
      <main className="mx-auto max-w-lg py-12">
        <div className="card-soft space-y-6 p-8 text-center">
          <h1 className="text-3xl">{copy.pinTitle}</h1>
          <p className="text-muted-foreground">{copy.pinBody}</p>
          <PinPad value={pin} onChange={setPin} length={6} busy={busy} onComplete={(v) => void submit(v)} />
          {busy ? <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" /> : null}
          {error ? (
            <p role="alert" className="text-lg text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </main>
    </GuestFrame>
  );
}
