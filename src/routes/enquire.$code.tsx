import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, CalendarHeart, Check, Loader2, Minus, Plus, ShowerHead, Tag, Users } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { enquiryCopy as copy, guest as guestCopy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { addDays, formatUkDate, nightsBetween } from "@/lib/dates";
import { enquiryConsentText, enquiryProblem, MAX_GUESTS, MAX_NIGHTS } from "@/lib/direct";
import { money, offerOn, quoteStay, roomTaken } from "@/lib/direct-rates";
import { getEnquiryPage, submitEnquiry } from "@/lib/direct.functions";
import { convert, countryOfLocale, currencyOfCountry, freeCancelUntil, normaliseDirectBooking, planRates, quotePlan, type PayMethod, type RatePlan } from "@/lib/direct-booking";
import { getFxRate, reserveDirect } from "@/lib/direct-booking.functions";
import { phoneCountries } from "@/lib/world";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * The property's own "Stay with us" page, laid out like a hotel's booking
 * page: pick arrival and departure on a calendar, see each room with its
 * nightly rate, whether it's free those nights and the estimated total (with
 * the host's seasonal offers taken off), then request a room. Nothing is
 * booked or paid here: the host confirms the stay and how to pay.
 */
export const Route = createFileRoute("/enquire/$code")({
  loader: ({ params }) => getEnquiryPage({ data: { code: params.code } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.found ? copy.pageTitle(loaderData.propertyName) : rebrand("Stay with us — Latchkey") },
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

/** ISO date ↔ a local Date for the calendar (no time zone shifts). */
const toDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Two months side by side on a wide screen, one on a phone. */
function useMonths() {
  const [months, setMonths] = useState(1);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setMonths(mq.matches ? 2 : 1);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return months;
}

function EnquirePage() {
  const page = Route.useLoaderData();
  const send = useServerFn(submitEnquiry);
  const months = useMonths();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [range, setRange] = useState<{ checkIn: string; checkOut: string }>(() => ({
    checkIn: page.found ? addDays(page.today, 14) : "",
    checkOut: page.found ? addDays(page.today, 16) : "",
  }));
  const [guests, setGuests] = useState(2);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", futureStays: false, agree: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Booking and paying here (when the host allows it): the room and rate chosen, and how to pay.
  const reserve = useServerFn(reserveDirect);
  const fxFn = useServerFn(getFxRate);
  const navigate = useNavigate();
  const [checkout, setCheckout] = useState<{ roomId: string; plan: RatePlan } | null>(null);
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [guestCountry, setGuestCountry] = useState<string>("");
  const [fx, setFx] = useState<{ currency: string; rate: number; date: string | null } | null>(null);
  // The guest's own country and currency, from their browser (they can change the country).
  useEffect(() => {
    const c = countryOfLocale(navigator.language) ?? (page.found ? page.country : "GB");
    setGuestCountry(c);
  }, [page]);
  useEffect(() => {
    if (!page.found) return;
    const theirs = currencyOfCountry(guestCountry);
    if (!theirs || theirs === page.currency) return setFx(null);
    void fxFn({ data: { from: page.currency, to: theirs } }).then((r) => setFx(r ? { currency: theirs, rate: r.rate, date: r.date } : null)).catch(() => setFx(null));
  }, [guestCountry, page, fxFn]);

  const nights = range.checkIn && range.checkOut ? nightsBetween(range.checkIn, range.checkOut) : 0;
  const rooms = page.found ? page.rooms : [];
  const offers = page.found ? page.offers : [];
  const currency = page.found ? page.currency : "GBP";
  const quoteFor = (r: (typeof rooms)[number]) => (r.ratePence !== null && nights > 0 ? quoteStay(r.ratePence, offers, r.id, range.checkIn, range.checkOut) : null);
  const freeFor = (r: (typeof rooms)[number]) => nights > 0 && !roomTaken(page.found ? (page.taken[r.id] ?? []) : [], range.checkIn, range.checkOut);
  const chosen = rooms.find((r) => r.id === roomId) ?? null;
  const booking = page.found ? page.booking : null;
  const bookingSettings = booking ? normaliseDirectBooking({ instant: booking.instant, freeCancelDays: booking.freeCancelDays, nonRef: booking.nonRef }) : null;
  const canBook = !!booking?.instant && !!bookingSettings;
  const planQuote = (r: (typeof rooms)[number], plan: RatePlan) => (canBook && r.ratePence !== null && nights > 0 ? quotePlan(r.ratePence, plan, bookingSettings!, offers, r.id, range.checkIn, range.checkOut) : null);
  const approx = (pence: number) => (fx ? copy.approx(money(convert(pence, fx.rate), fx.currency)) : null);
  const cancelBy = canBook && range.checkIn ? freeCancelUntil(range.checkIn, bookingSettings!, page.found ? page.today : "") : null;
  const checkoutRoom = checkout ? (rooms.find((r) => r.id === checkout.roomId) ?? null) : null;
  const checkoutQuote = checkoutRoom && checkout ? planQuote(checkoutRoom, checkout.plan) : null;
  // Nights any offer covers, marked on the calendar.
  const offerDays = useMemo(() => {
    const out: Date[] = [];
    for (const o of offers) for (let d = o.from; d <= o.to && out.length < 800; d = addDays(d, 1)) out.push(toDate(d));
    return out;
  }, [offers]);

  if (!page.found) {
    return (
      <GuestFrame>
        <GuestMessage text={copy.notFound} />
      </GuestFrame>
    );
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function pickRange(r: DateRange | undefined) {
    const from = r?.from ? toIso(r.from) : "";
    const to = r?.to ? toIso(r.to) : "";
    setRange({ checkIn: from, checkOut: to && to > from ? to : "" });
  }

  function request(id: string | null) {
    setRoomId(id);
    setError(null);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!page.found || !checkout || !method) return;
    const problem = enquiryProblem({ ...form, phone: form.phone || null, checkIn: range.checkIn, checkOut: range.checkOut, guests }, page.today) ?? (form.agree ? null : copy.bookingAgreeNeeded);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const r = await reserve({
        data: {
          code: page.shortCode,
          roomId: checkout.roomId,
          checkIn: range.checkIn,
          checkOut: range.checkOut,
          guests,
          plan: checkout.plan,
          method,
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          guestCountry: /^[A-Z]{2}$/.test(guestCountry) ? guestCountry : null,
          message: form.message || null,
          origin: window.location.origin,
          website: form.website,
        },
      });
      // Card: on to the host's Stripe checkout; otherwise straight to the confirmation.
      if (r.url) window.location.assign(r.url);
      else await navigate({ to: "/reserve/$token", params: { token: r.token } });
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.failed);
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!page.found) return;
    const input = { ...form, phone: form.phone || null, checkIn: range.checkIn, checkOut: range.checkOut, guests };
    const problem = enquiryProblem(input, page.today) ?? (form.agree ? null : copy.agreeNeeded);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await send({
        data: {
          code: page.shortCode,
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          checkIn: range.checkIn,
          checkOut: range.checkOut,
          guests,
          message: form.message || null,
          futureStays: form.futureStays,
          roomId,
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

  return (
    <GuestFrame theme={page.theme} name={page.propertyName}>
      <main className="mx-auto max-w-6xl space-y-6 py-6 sm:py-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{copy.eyebrow}</p>
          <h1 className="mt-2 text-3xl sm:text-5xl">{copy.title(page.propertyName)}</h1>
          <p className="mt-2 max-w-3xl text-lg text-muted-foreground">{canBook ? copy.introBook(page.business) : copy.intro(page.business)}</p>
        </header>

        {offers.length ? (
          <section aria-label={copy.offersTitle} className="flex flex-wrap gap-2">
            {offers.map((o) => (
              <span key={o.id} className="flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1.5 text-sm">
                <Tag className="size-4 text-accent" />
                <span className="font-medium">{o.label}</span>
                <span className="text-muted-foreground">
                  {copy.offerLine(o.percent, formatUkDate(o.from), formatUkDate(o.to))}
                </span>
              </span>
            ))}
          </section>
        ) : null}

        {sent ? (
          <section className="card-soft space-y-3 p-6 text-center" role="status">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-7" />
            </span>
            <h2 className="text-2xl">{copy.sentTitle}</h2>
            <p className="text-muted-foreground">{copy.sentBody(page.business)}</p>
          </section>
        ) : (
          <>
            {/* Dates and guests, like a hotel's booking bar. */}
            <section className="card-soft grid gap-4 p-4 sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)]">
              <Calendar
                mode="range"
                numberOfMonths={months}
                defaultMonth={range.checkIn ? toDate(range.checkIn) : toDate(page.today)}
                selected={{ from: range.checkIn ? toDate(range.checkIn) : undefined, to: range.checkOut ? toDate(range.checkOut) : undefined }}
                onSelect={pickRange}
                disabled={[{ before: toDate(page.today) }, { after: toDate(addDays(page.today, 730)) }]}
                modifiers={{ offer: offerDays }}
                modifiersClassNames={{ offer: "[&>button]:font-semibold [&>button]:text-accent [&>button]:underline [&>button]:decoration-accent [&>button]:underline-offset-4" }}
                className="mx-auto rounded-2xl border border-border [--cell-size:2.5rem]"
              />
              <div className="flex flex-col justify-center gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{copy.checkIn}</p>
                    <p className="mt-1 text-lg font-medium">{range.checkIn ? formatUkDate(range.checkIn) : copy.pickDate}</p>
                  </div>
                  <div className="rounded-2xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{copy.checkOut}</p>
                    <p className="mt-1 text-lg font-medium">{range.checkOut ? formatUkDate(range.checkOut) : copy.pickDate}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3">
                  <span className="flex items-center gap-2 font-medium">
                    <Users className="size-5 text-primary" /> {copy.guests}
                  </span>
                  <span className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="icon" aria-label={copy.fewer} disabled={guests <= 1} onClick={() => setGuests((g) => Math.max(1, g - 1))}>
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-8 text-center text-lg tabular-nums" aria-live="polite">{guests}</span>
                    <Button type="button" variant="outline" size="icon" aria-label={copy.more} disabled={guests >= MAX_GUESTS} onClick={() => setGuests((g) => Math.min(MAX_GUESTS, g + 1))}>
                      <Plus className="size-4" />
                    </Button>
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {nights > 0 ? (nights > MAX_NIGHTS ? copy.tooLong(MAX_NIGHTS) : copy.nights(nights)) : copy.pickBoth}
                  {offers.length ? ` ${copy.offerDaysHint}` : ""}
                </p>
              </div>
            </section>

            {/* The rooms for those dates. */}
            {rooms.length ? (
              <section aria-label={copy.roomsTitle} className="space-y-3">
                <h2 className="text-2xl">{copy.roomsTitle}</h2>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rooms.map((r) => {
                    const q = quoteFor(r);
                    const free = freeFor(r);
                    const fits = guests <= r.maxGuests;
                    const tonight = r.ratePence !== null && range.checkIn ? offerOn(offers, r.id, range.checkIn) : null;
                    return (
                      <li key={r.id} className={cn("card-soft flex flex-col overflow-hidden p-0", roomId === r.id && "ring-2 ring-primary")}>
                        {r.photo ? (
                          <img src={r.photo} alt="" loading="lazy" className="aspect-[16/7] w-full object-cover sm:aspect-[16/10]" />
                        ) : (
                          <div className="grid aspect-[16/7] w-full place-items-center bg-primary/10 text-primary sm:aspect-[16/10]">
                            <BedDouble className="size-10" />
                          </div>
                        )}
                        <div className="flex flex-1 flex-col gap-2 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-xl leading-tight">{r.name}</h3>
                            {r.ratePence !== null ? (
                              <p className="shrink-0 text-right">
                                <span className="block text-lg font-semibold">{money(r.ratePence, currency)}</span>
                                <span className="block text-xs text-muted-foreground">{copy.perNight}</span>
                              </p>
                            ) : null}
                          </div>
                          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="size-4" /> {copy.sleeps(r.maxGuests)}</span>
                            {r.ensuite ? <span className="flex items-center gap-1"><ShowerHead className="size-4" /> {copy.ensuite}</span> : null}
                          </p>
                          {r.description ? <p className="line-clamp-3 text-sm">{r.description}</p> : null}
                          <div className="mt-auto space-y-2 border-t border-border pt-3">
                            {nights > 0 && nights <= MAX_NIGHTS ? (
                              !free ? (
                                <p className="text-sm font-medium text-destructive">{copy.takenForDates}</p>
                              ) : !fits ? (
                                <p className="text-sm font-medium text-destructive">{copy.tooMany(r.maxGuests)}</p>
                              ) : canBook && r.ratePence !== null ? (
                                // Booking.com style: each rate with what it includes, its total and Reserve.
                                <ul className="space-y-2">
                                  {(["flex", "nonref"] as const).map((plan) => {
                                    const pq = planQuote(r, plan);
                                    if (!pq) return null;
                                    return (
                                      <li key={plan} className="rounded-xl border border-border p-2.5">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0 text-sm">
                                            <p className="font-medium">{plan === "flex" ? copy.planFlex : copy.planNonRef}</p>
                                            <p className={cn("text-xs", plan === "flex" && cancelBy ? "text-success" : "text-muted-foreground")}>
                                              {plan === "flex" ? (cancelBy ? copy.freeCancel(formatUkDate(cancelBy)) : copy.noFreeCancel) : copy.nonRefNote(bookingSettings!.nonRef.kind === "percent" ? `${bookingSettings!.nonRef.value}%` : money(planRates(r.ratePence!, bookingSettings!).flex - (planRates(r.ratePence!, bookingSettings!).nonref ?? 0), currency))}
                                            </p>
                                          </div>
                                          <div className="shrink-0 text-right">
                                            {pq.discount > 0 ? <p className="text-xs text-muted-foreground line-through">{money(pq.base, currency)}</p> : null}
                                            <p className="font-semibold">{money(pq.total, currency)}</p>
                                            {approx(pq.total) ? <p className="text-[11px] text-muted-foreground">{approx(pq.total)}</p> : null}
                                          </div>
                                        </div>
                                        <Button type="button" size="sm" className="mt-2 w-full" variant={checkout?.roomId === r.id && checkout.plan === plan ? "secondary" : "default"} onClick={() => {
                                          setCheckout({ roomId: r.id, plan });
                                          setMethod(booking!.methods[0] ?? null);
                                          setRoomId(r.id);
                                          setError(null);
                                          window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                                        }}>
                                          {copy.reserve}
                                        </Button>
                                      </li>
                                    );
                                  })}
                                  {q?.applied.length ? <li className="text-xs text-accent">{q.applied.map((o) => o.label).join(" · ")}</li> : null}
                                </ul>
                              ) : q ? (
                                <p className="flex flex-wrap items-baseline gap-x-2">
                                  {q.discount > 0 ? <span className="text-sm text-muted-foreground line-through">{money(q.base, currency)}</span> : null}
                                  <span className="text-lg font-semibold">{money(q.total, currency)}</span>
                                  <span className="text-sm text-muted-foreground">{copy.forNights(q.nights)}</span>
                                  {q.applied.length ? <span className="w-full text-xs text-accent">{q.applied.map((o) => o.label).join(" · ")}</span> : null}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">{copy.freeAskPrice}</p>
                              )
                            ) : tonight ? (
                              <p className="text-xs text-accent">{tonight.label}</p>
                            ) : null}
                            {canBook && r.ratePence !== null && nights > 0 && nights <= MAX_NIGHTS && free && fits ? null : (
                              <Button type="button" className="w-full" disabled={nights <= 0 || nights > MAX_NIGHTS || !free || !fits} onClick={() => {
                                setCheckout(null);
                                request(r.id);
                              }}>
                                {roomId === r.id && !checkout ? <Check className="size-4" /> : null} {roomId === r.id && !checkout ? copy.chosen : copy.requestRoom}
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-sm text-muted-foreground">
                  {copy.notSure}{" "}
                  <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => {
                    setCheckout(null);
                    request(null);
                  }}>
                    {copy.generalEnquiry}
                  </button>
                </p>
              </section>
            ) : null}

            {checkout && checkoutRoom && checkoutQuote ? (
              <form ref={formRef} onSubmit={(e) => void book(e)} className="card-soft scroll-mt-6 space-y-5 p-5 sm:p-6" noValidate>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-2xl">{copy.checkoutTitle}</h2>
                  <button type="button" className="text-sm text-primary hover:underline" onClick={() => setCheckout(null)}>{copy.changeRoom}</button>
                </div>
                {/* What they're booking, like a hotel's summary. */}
                <div className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-1 text-sm">
                    <p className="text-lg font-medium">{checkoutRoom.name}</p>
                    <p>{copy.summary(formatUkDate(range.checkIn), formatUkDate(range.checkOut), nights, guests)}</p>
                    <p className={checkout.plan === "flex" && cancelBy ? "text-success" : "text-muted-foreground"}>
                      {checkout.plan === "flex" ? (cancelBy ? copy.freeCancel(formatUkDate(cancelBy)) : copy.noFreeCancel) : copy.planNonRefLong}
                    </p>
                    {checkoutQuote.applied.length ? <p className="text-accent">{checkoutQuote.applied.map((o) => o.label).join(" · ")}</p> : null}
                  </div>
                  <div className="text-right">
                    {checkoutQuote.discount > 0 ? <p className="text-sm text-muted-foreground line-through">{money(checkoutQuote.base, currency)}</p> : null}
                    <p className="text-2xl font-semibold">{money(checkoutQuote.total, currency)}</p>
                    {fx ? <p className="text-xs text-muted-foreground">{copy.fxLine(money(convert(checkoutQuote.total, fx.rate), fx.currency), currency, fx.rate, fx.currency)}</p> : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="bk-name">{copy.name}</Label>
                    <Input id="bk-name" className="h-12" autoComplete="name" maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="bk-email">{copy.email}</Label>
                    <Input id="bk-email" type="email" className="h-12" autoComplete="email" maxLength={254} value={form.email} onChange={(e) => set("email", e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="bk-phone">{copy.phone}</Label>
                    <Input id="bk-phone" type="tel" className="h-12" autoComplete="tel" maxLength={30} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="bk-country">{copy.country}</Label>
                    <select id="bk-country" className="h-12 w-full rounded-xl border border-input bg-surface px-3" value={guestCountry} onChange={(e) => setGuestCountry(e.target.value)}>
                      {phoneCountries().map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.name}</option>)}
                    </select>
                  </div>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{copy.howToPay}</legend>
                  <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
                    {booking!.methods.map((m) => (
                      <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={cn("rounded-xl border p-3 text-left text-sm", method === m ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-secondary")}>
                        <span className="block font-medium">{copy.methods[m].label}</span>
                        <span className="block text-xs text-muted-foreground">{m === "bank" ? copy.methods.bank.help(booking!.bankPayDays) : copy.methods[m].help}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-1">
                  <Label htmlFor="bk-msg">{copy.message}</Label>
                  <Textarea id="bk-msg" rows={2} maxLength={2000} placeholder={copy.messagePlaceholder} value={form.message} onChange={(e) => set("message", e.target.value)} />
                </div>
                <label className="flex items-start gap-3 rounded-2xl bg-muted p-3 text-sm">
                  <Checkbox checked={form.agree} onCheckedChange={(v) => set("agree", v === true)} className="mt-0.5" />
                  <span>{copy.bookingAgree(page.business)}</span>
                </label>
                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy || !method}>
                  {busy ? <Loader2 className="animate-spin" /> : <CalendarHeart />}{" "}
                  {method === "card" ? copy.bookAndPay(money(checkoutQuote.total, currency)) : copy.bookNow}
                </Button>
                <p className="text-xs text-muted-foreground">{method === "card" ? copy.cardNote : copy.bookingNote}</p>
              </form>
            ) : (
            <form ref={formRef} onSubmit={submit} className="card-soft scroll-mt-6 space-y-4 p-5 sm:p-6" noValidate>
              <h2 className="text-2xl">{chosen ? copy.requestTitle(chosen.name) : copy.enquiryTitle}</h2>
              <p className="rounded-xl bg-muted p-3 text-sm">
                {range.checkIn && range.checkOut ? copy.summary(formatUkDate(range.checkIn), formatUkDate(range.checkOut), nights, guests) : copy.pickBoth}
                {chosen && quoteFor(chosen) ? ` · ${copy.estimate(money(quoteFor(chosen)!.total, currency))}` : ""}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="enq-name">{copy.name}</Label>
                  <Input id="enq-name" className="h-12" autoComplete="name" maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="enq-email">{copy.email}</Label>
                  <Input id="enq-email" type="email" className="h-12" autoComplete="email" maxLength={254} value={form.email} onChange={(e) => set("email", e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="enq-phone">{copy.phone}</Label>
                  <Input id="enq-phone" type="tel" className="h-12" autoComplete="tel" maxLength={30} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="enq-msg">{copy.message}</Label>
                  <Textarea id="enq-msg" rows={2} maxLength={2000} placeholder={copy.messagePlaceholder} value={form.message} onChange={(e) => set("message", e.target.value)} />
                </div>
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
                {busy ? <Loader2 className="animate-spin" /> : <CalendarHeart />} {chosen ? copy.sendRequest : copy.send}
              </Button>
              <p className="text-xs text-muted-foreground">{copy.notBooked}</p>
            </form>
            )}
          </>
        )}
      </main>
    </GuestFrame>
  );
}
