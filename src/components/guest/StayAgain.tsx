import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarHeart, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { stayAgainCopy as copy } from "@/content/copy";
import { getStayAgain, saveStayAgain } from "@/lib/direct.functions";

/**
 * "Stay with us again": the guest can ask the business to get in touch about
 * future stays (an unticked box, the exact words kept with their consent, a
 * link to withdraw), or ask about dates now on the property's enquiry page.
 */
export function StayAgain({ token }: { token: string }) {
  const fetchFn = useServerFn(getStayAgain);
  const saveFn = useServerFn(saveStayAgain);
  const q = useQuery({ queryKey: ["stay-again", token], queryFn: () => fetchFn({ data: { token } }) });
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<string | null>(null);
  useEffect(() => {
    if (q.data?.found) {
      setEmail(q.data.email);
      setWithdraw(q.data.withdrawToken);
    }
  }, [q.data]);

  const d = q.data;
  if (!d || !d.found) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await saveFn({ data: { token, email, agree: true } });
      setWithdraw(r.withdrawToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="stay-again" className="card-soft space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <CalendarHeart className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 id="stay-again" className="text-xl">{copy.title}</h2>
          <p className="text-muted-foreground">{copy.body(d.business)}</p>
        </div>
      </div>
      {d.shortCode ? (
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <a href={`/enquire/${d.shortCode}`}>{copy.ask}</a>
        </Button>
      ) : null}
      {withdraw ? (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted p-3 text-sm" role="status">
          <Check className="size-4 text-primary" /> {copy.onList(d.business)}{" "}
          <a href={`/stay-again/withdraw/${withdraw}`} className="font-medium text-primary underline-offset-2 hover:underline">{copy.changedMind}</a>
        </p>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
            <span>{d.consent}</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="email" className="h-11" autoComplete="email" placeholder={copy.emailPlaceholder} aria-label={copy.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button onClick={() => void save()} disabled={!agree || !email.trim() || busy} className="shrink-0">
              {busy ? <Loader2 className="animate-spin" /> : null} {copy.save}
            </Button>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
