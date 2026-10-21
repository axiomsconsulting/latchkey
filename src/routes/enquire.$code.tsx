import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarHeart, Check, Loader2 } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { enquiryCopy as copy, guest as guestCopy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { addDays } from "@/lib/dates";
import { enquiryConsentText, enquiryProblem, MAX_GUESTS } from "@/lib/direct";
import { getEnquiryPage, submitEnquiry } from "@/lib/direct.functions";

/**
 * The property's own enquiry page: a past guest (or anyone) asks about dates
 * directly. The host replies from their own mailbox; nothing is booked or
 * paid here, so it never pretends to be a booking engine.
 */
export const Route = createFileRoute("/enquire/$code")({
  loader: ({ params }) => getEnquiryPage({ data: { code: params.code } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.found ? copy.pageTitle(loaderData.propertyName) : rebrand("Ask about a stay — Latchkey") },
      { name: "description", content: copy.metaDescription },
    ],
  }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={guestCopy.error} />
    </GuestFrame>
  ),
  component: EnquirePage,
});

function EnquirePage() {
  const page = Route.useLoaderData();
  const send = useServerFn(submitEnquiry);
  const [form, setForm] = useState(() => ({
    name: "",
    email: "",
    phone: "",
    checkIn: page.found ? addDays(page.today, 14) : "",
    checkOut: page.found ? addDays(page.today, 16) : "",
    guests: 2,
    message: "",
    futureStays: false,
    agree: false,
    website: "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!page.found) {
    return (
      <GuestFrame>
        <GuestMessage text={copy.notFound} />
      </GuestFrame>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!page.found) return;
    const problem = enquiryProblem({ ...form, phone: form.phone || null }, page.today) ?? (form.agree ? null : copy.agreeNeeded);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await send({
        data: {
          code: page.shortCode,
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          guests: form.guests,
          message: form.message || null,
          futureStays: form.futureStays,
          website: form.website,
        },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.failed);
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <GuestFrame theme={page.theme} name={page.propertyName}>
      <main className="mx-auto max-w-2xl space-y-6 py-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{copy.eyebrow}</p>
          <h1 className="mt-2 text-3xl sm:text-5xl">{copy.title(page.propertyName)}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{copy.intro(page.business)}</p>
        </header>

        {sent ? (
          <section className="card-soft space-y-3 p-6 text-center" role="status">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-7" />
            </span>
            <h2 className="text-2xl">{copy.sentTitle}</h2>
            <p className="text-muted-foreground">{copy.sentBody(page.business)}</p>
          </section>
        ) : (
          <form onSubmit={submit} className="card-soft space-y-4 p-5 sm:p-6" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="enq-in">{copy.checkIn}</Label>
                <Input id="enq-in" type="date" className="h-12" min={page.today} value={form.checkIn} onChange={(e) => set("checkIn", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="enq-out">{copy.checkOut}</Label>
                <Input id="enq-out" type="date" className="h-12" min={form.checkIn || page.today} value={form.checkOut} onChange={(e) => set("checkOut", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="enq-guests">{copy.guests}</Label>
              <Input id="enq-guests" type="number" inputMode="numeric" min={1} max={MAX_GUESTS} className="h-12 w-32" value={form.guests} onChange={(e) => set("guests", Number(e.target.value) || 1)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="enq-name">{copy.name}</Label>
                <Input id="enq-name" className="h-12" autoComplete="name" maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="enq-email">{copy.email}</Label>
                <Input id="enq-email" type="email" className="h-12" autoComplete="email" maxLength={254} value={form.email} onChange={(e) => set("email", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="enq-phone">{copy.phone}</Label>
              <Input id="enq-phone" type="tel" className="h-12" autoComplete="tel" maxLength={30} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="enq-msg">{copy.message}</Label>
              <Textarea id="enq-msg" rows={4} maxLength={2000} placeholder={copy.messagePlaceholder} value={form.message} onChange={(e) => set("message", e.target.value)} />
            </div>
            {/* Hidden from people; bots fill it in. */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-2xl bg-muted p-3 text-sm">
              <Checkbox checked={form.agree} onCheckedChange={(v) => set("agree", v === true)} className="mt-0.5" />
              <span>{enquiryConsentText(page.business)}</span>
            </label>
            {/* Separate, unticked, and optional: future stays. */}
            <label className="flex items-start gap-3 rounded-2xl border border-border p-3 text-sm">
              <Checkbox checked={form.futureStays} onCheckedChange={(v) => set("futureStays", v === true)} className="mt-0.5" />
              <span>
                {page.consent} <span className="text-muted-foreground">{copy.optional}</span>
              </span>
            </label>

            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <CalendarHeart />} {copy.send}
            </Button>
            <p className="text-xs text-muted-foreground">{copy.notBooked}</p>
          </form>
        )}
      </main>
    </GuestFrame>
  );
}
