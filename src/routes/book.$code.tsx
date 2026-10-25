import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BedDouble, CalendarHeart, Check, Loader2, MessageCircleQuestion, Plus, ShowerHead, Star, Tag, Users, X } from "lucide-react";

import { BookingBar } from "@/components/guest/BookingBar";
import { ContactFields, EnquiryDialog, emptyContact, type Contact } from "@/components/guest/EnquiryDialog";
import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bookPageCopy as copy, enquiryCopy, guest as guestCopy, pageReviewsCopy as reviewsCopy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { addDays, formatUkDate, nightsBetween } from "@/lib/dates";
import type { Stay } from "@/lib/date-pick";
import { enquiryProblem, MAX_GUESTS, MAX_NIGHTS } from "@/lib/direct";
import { convert, countryOfLocale, currencyOfCountry, freeCancelUntil, normaliseDirectBooking, partyText, planRates, quotePlan, splitGuests, type PayMethod, type RatePlan } from "@/lib/direct-booking";
import { getFxRate, reserveDirect } from "@/lib/direct-booking.functions";
import { money, quoteStay, roomTaken } from "@/lib/direct-rates";
import { getEnquiryPage } from "@/lib/direct.functions";
import { cn } from "@/lib/utils";
import { phoneCountries } from "@/lib/world";

/**
 * The property's own booking page (/book/<short code>), hotel style: Arrive ·
 * Leave · Guests across the top (the calendar folds out underneath), the rooms
 * as tiles with the free ones first, and the booking in the right-hand third:
 * the rooms chosen (several can be booked together), refundable or
 * non-refundable, contact details and how to pay. On a phone it's two steps:
 * rooms, then the booking. Each room can also be asked about in a box over
 * the page. When the host hasn't turned booking on, rooms are enquired about only.
 */
export const Route = createFileRoute("/book/$code")({
  loader: ({ params }) => getEnquiryPage({ data: { code: params.code } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.found ? enquiryCopy.pageTitle(loaderData.propertyName) : rebrand("Stay with us — Latchkey") },
      { name: "description", content: enquiryCopy.metaDescription },
    ],
  }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={guestCopy.error} />
    </GuestFrame>
  ),
  component: BookPage,
});

type Page = Extract<Awaited<ReturnType<typeof getEnquiryPage>>, { found: true }>;
type Room = Page["rooms"][number];

function BookPage() {
  const page = Route.useLoaderData();
  if (!page.found) {
    return (
      <GuestFrame>
        <GuestMessage text={enquiryCopy.notFound} />
      </GuestFrame>
    );
  }
  return <Booking page={page} />;
}

function Booking({ page }: { page: Page }) {
  const navigate = useNavigate();
  const reserve = useServerFn(reserveDirect);
  const fxFn = useServerFn(getFxRate);

  const [stay, setStay] = useState<Stay>(() => ({ checkIn: addDays(page.today, 14), checkOut: addDays(page.today, 16) }));
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [plan, setPlan] = useState<RatePlan>("flex");
  const [step, setStep] = useState<"rooms" | "book">("rooms");
  const [guestCountry, setGuestCountry] = useState(page.country);
  const [contact, setContact] = useState<Contact>(() => emptyContact(page.country));
  const [method, setMethod] = useState<PayMethod | null>(page.booking.methods[0] ?? null);
  const [message, setMessage] = useState("");
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fx, setFx] = useState<{ currency: string; rate: number } | null>(null);
  const [enquiry, setEnquiry] = useState<{ open: boolean; room: Room | null }>({ open: false, room: null });

  // The guest's own country (for their currency and the right bank details), from their browser.
  useEffect(() => {
    const c = countryOfLocale(navigator.language);
    if (c) {
      setGuestCountry(c);
      setContact((x) => (x.phoneNational ? x : { ...x, phoneCountry: c }));
    }
  }, []);
  useEffect(() => {
    const theirs = currencyOfCountry(guestCountry);
    if (!theirs || theirs === page.currency) return setFx(null);
    void fxFn({ data: { from: page.currency, to: theirs } }).then((r) => setFx(r ? { currency: theirs, rate: r.rate } : null)).catch(() => setFx(null));
  }, [guestCountry, page.currency, fxFn]);
  // Each step starts at the top on a phone.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const children = page.booking.children ? kids : 0;
  const guests = adults + children;
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const settings = normaliseDirectBooking({ instant: page.booking.instant, freeCancelDays: page.booking.freeCancelDays, nonRef: page.booking.nonRef, children: page.booking.children });
  const canBook = page.booking.instant;
  const bounds = useMemo(() => ({ min: page.today, max: addDays(page.today, 730), maxNights: MAX_NIGHTS }), [page.today]);
  const maxGuests = Math.min(MAX_GUESTS, Math.max(2, page.rooms.reduce((a, r) => a + r.maxGuests, 0)));

  const free = (r: Room) => !roomTaken(page.taken[r.id] ?? [], stay.checkIn, stay.checkOut);
  const bookable = (r: Room) => canBook && r.ratePence !== null && free(r);
  const quote = (r: Room, p: RatePlan) => (r.ratePence !== null ? quotePlan(r.ratePence, p, settings, page.offers, r.id, stay.checkIn, stay.checkOut) : null);
  const estimate = (r: Room) => (r.ratePence !== null ? quoteStay(r.ratePence, page.offers, r.id, stay.checkIn, stay.checkOut) : null);
  const approx = (pence: number) => (fx ? enquiryCopy.approx(money(convert(pence, fx.rate), fx.currency)) : null);

  // Free rooms first (cheapest first), then the rest.
  const rooms = useMemo(
    () =>
      [...page.rooms].sort((a, b) => {
        const fa = free(a) ? 0 : 1;
        const fb = free(b) ? 0 : 1;
        return fa - fb || (a.ratePence ?? Infinity) - (b.ratePence ?? Infinity);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page.rooms, page.taken, stay.checkIn, stay.checkOut],
  );

  // Rooms chosen that are no longer free for new dates drop out.
  useEffect(() => {
    setSelected((s) => s.filter((id) => {
      const r = page.rooms.find((x) => x.id === id);
      return !!r && bookable(r);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stay.checkIn, stay.checkOut]);

  const chosen = selected.map((id) => page.rooms.find((r) => r.id === id)).filter((r): r is Room => !!r);
  const nonRefOffered = chosen.length > 0 && chosen.every((r) => quote(r, "nonref") !== null);
  const usePlan: RatePlan = plan === "nonref" && nonRefOffered ? "nonref" : "flex";
  const totals = (p: RatePlan) => chosen.reduce((a, r) => a + (quote(r, p)?.total ?? 0), 0);
  const total = totals(usePlan);
  const capacity = chosen.reduce((a, r) => a + r.maxGuests, 0);
  const fits = splitGuests(guests, chosen.map((r) => r.maxGuests)) !== null;
  const cancelBy = freeCancelUntil(stay.checkIn, settings, page.today);

  // Nights with no room free, and nights with an offer, for the calendar.
  const fullDay = (day: string) => page.rooms.length > 0 && page.rooms.every((r) => roomTaken(page.taken[r.id] ?? [], day, addDays(day, 1)));
  const offerDay = (day: string) => page.offers.some((o) => day >= o.from && day <= o.to);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!method || !chosen.length) return;
    const problem =
      enquiryProblem({ name: contact.name, email: contact.email, phone: contact.phone, checkIn: stay.checkIn, checkOut: stay.checkOut, guests }, page.today) ??
      (!fits ? (guests < chosen.length ? copy.tooManyRooms : copy.needMore(guests - capacity)) : null) ??
      (agree ? null : enquiryCopy.bookingAgreeNeeded);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const r = await reserve({
        data: {
          code: page.shortCode,
          roomIds: chosen.map((x) => x.id),
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          guests,
          children,
          plan: usePlan,
          method,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          guestCountry: /^[A-Z]{2}$/.test(guestCountry) ? guestCountry : null,
          message: message || null,
          origin: window.location.origin,
          website,
        },
      });
      // Card: on to the host's Stripe checkout; otherwise straight to the confirmation.
      if (r.url) window.location.assign(r.url);
      else await navigate({ to: "/reserve/$token", params: { token: r.token } });
    } catch (err) {
      setError(err instanceof Error ? err.message : enquiryCopy.failed);
      setBusy(false);
    }
  }

  const enquiryRoom = enquiry.room;
  const enquiryEstimate = enquiryRoom ? estimate(enquiryRoom) : null;

  return (
    <GuestFrame theme={page.theme} name={page.propertyName} wide>
      <main className="mx-auto max-w-6xl space-y-5 py-6 pb-28 sm:py-8 lg:pb-8">
        <header className={cn("space-y-2", step === "book" && "hidden lg:block")}>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{enquiryCopy.eyebrow}</p>
          <h1 className="text-3xl sm:text-5xl">{enquiryCopy.title(page.propertyName)}</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">{canBook ? enquiryCopy.introBook(page.business) : enquiryCopy.intro(page.business)}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {page.offers.map((o) => (
              <span key={o.id} className="flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1.5 text-sm">
                <Tag className="size-4 text-accent" />
                <span className="font-medium">{o.label}</span>
                <span className="text-muted-foreground">{copy.offerDates(formatUkDate(o.from), formatUkDate(o.to))}</span>
              </span>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setEnquiry({ open: true, room: null })}>
              <MessageCircleQuestion className="size-4" /> {copy.askQuestion}
            </Button>
          </div>
        </header>

        <div className={cn(step === "book" && "hidden lg:block")}>
          <BookingBar
            stay={stay}
            bounds={bounds}
            adults={adults}
            children={kids}
            askChildren={page.booking.children}
            maxGuests={maxGuests}
            onStay={setStay}
            onParty={(a, c) => {
              setAdults(a);
              setKids(c);
            }}
            full={fullDay}
            offer={offerDay}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Rooms: two by two on a wide screen, free ones first. */}
          <section aria-label={copy.roomsTitle} className={cn("space-y-3 lg:col-span-2", step === "book" && "hidden lg:block")}>
            <h2 className="text-2xl">{copy.roomsTitle}</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {rooms.map((r) => {
                const isFree = free(r);
                const isChosen = selected.includes(r.id);
                const est = estimate(r);
                return (
                  <li key={r.id} className={cn("card-soft flex flex-col overflow-hidden p-0", isChosen && "ring-2 ring-primary", !isFree && "opacity-70")}>
                    {r.photo ? (
                      <img src={r.photo} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
                    ) : (
                      <div className="grid aspect-[16/9] w-full place-items-center bg-primary/10 text-primary">
                        <BedDouble className="size-10" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xl leading-tight">{r.name}</h3>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", isFree ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                          {isFree ? copy.available : copy.roomsUnavailable}
                        </span>
                      </div>
                      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="size-4" /> {copy.sleeps(r.maxGuests)}</span>
                        {r.ensuite ? <span className="flex items-center gap-1"><ShowerHead className="size-4" /> {copy.ensuite}</span> : null}
                        {r.ratePence !== null ? <span>{copy.perNight(money(r.ratePence, page.currency))}</span> : null}
                      </p>
                      {r.description ? <p className="line-clamp-2 text-sm">{r.description}</p> : null}
                      <div className="mt-auto space-y-2 border-t border-border pt-3">
                        {!isFree ? (
                          <p className="text-sm text-muted-foreground">{copy.booked}</p>
                        ) : bookable(r) ? (
                          <dl className="space-y-1 text-sm">
                            {(["flex", "nonref"] as const).map((p) => {
                              const q = quote(r, p);
                              if (!q) return null;
                              return (
                                <div key={p} className="flex items-baseline justify-between gap-2">
                                  <dt className="text-muted-foreground">{p === "flex" ? enquiryCopy.planFlex : enquiryCopy.planNonRef}</dt>
                                  <dd className="text-right">
                                    {q.discount > 0 ? <span className="mr-1 text-xs text-muted-foreground line-through">{money(q.base, page.currency)}</span> : null}
                                    <span className="font-semibold">{money(q.total, page.currency)}</span>
                                    {approx(q.total) ? <span className="block text-[11px] text-muted-foreground">{approx(q.total)}</span> : null}
                                  </dd>
                                </div>
                              );
                            })}
                            <p className="text-xs text-muted-foreground">{copy.forNights(nights)}</p>
                          </dl>
                        ) : est ? (
                          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                            <span className="font-semibold">{money(est.total, page.currency)}</span>
                            <span className="text-muted-foreground">{copy.forNights(est.nights)}</span>
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">{copy.askPrice}</p>
                        )}
                        {isFree ? (
                          <div className="flex gap-2">
                            {bookable(r) ? (
                              <Button type="button" className="flex-1" variant={isChosen ? "secondary" : "default"} onClick={() => toggle(r.id)} aria-pressed={isChosen}>
                                {isChosen ? <Check className="size-4" /> : <Plus className="size-4" />} {isChosen ? copy.added : copy.add}
                              </Button>
                            ) : null}
                            <Button type="button" variant="outline" className={bookable(r) ? "" : "flex-1"} onClick={() => setEnquiry({ open: true, room: r })}>
                              {copy.enquire}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* The booking: the right-hand third on a wide screen, the second step on a phone. */}
          <aside className={cn("lg:col-span-1", step === "rooms" && "hidden lg:block")}>
            <div className="space-y-4 lg:sticky lg:top-4">
              <button type="button" onClick={() => setStep("rooms")} className="flex items-center gap-1 text-sm font-medium text-primary lg:hidden">
                <ArrowLeft className="size-4" /> {copy.back}
              </button>
              <section className="card-soft space-y-4 p-4 sm:p-5">
                <div>
                  <h2 className="text-2xl">{copy.panelTitle}</h2>
                  <p className="text-sm text-muted-foreground">{copy.enquirySummary(formatUkDate(stay.checkIn), formatUkDate(stay.checkOut), nights, partyText(adults, children))}</p>
                </div>
                {!canBook ? (
                  <p className="rounded-xl bg-muted p-3 text-sm">{copy.panelRequest(page.business)}</p>
                ) : !chosen.length ? (
                  <p className="rounded-xl bg-muted p-3 text-sm">{copy.panelEmpty}</p>
                ) : (
                  <form onSubmit={(e) => void book(e)} className="space-y-4" noValidate>
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {chosen.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{r.name}</span>
                            <span className="text-xs text-muted-foreground">{copy.sleeps(r.maxGuests)}</span>
                          </span>
                          <span className="font-medium tabular-nums">{money(quote(r, usePlan)?.total ?? 0, page.currency)}</span>
                          <button type="button" onClick={() => toggle(r.id)} aria-label={copy.removeRoom(r.name)} className="grid size-8 place-items-center rounded-lg hover:bg-secondary">
                            <X className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {!fits ? <p className="rounded-xl bg-accent/15 p-3 text-sm">{guests < chosen.length ? copy.tooManyRooms : copy.needMore(guests - capacity)}</p> : null}

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">{copy.rate}</legend>
                      <div role="radiogroup" className="grid gap-2">
                        {(["flex", "nonref"] as const).filter((p) => p === "flex" || nonRefOffered).map((p) => (
                          <button key={p} type="button" role="radio" aria-checked={usePlan === p} onClick={() => setPlan(p)} className={cn("flex items-start justify-between gap-3 rounded-xl border p-3 text-left text-sm", usePlan === p ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-secondary")}>
                            <span>
                              <span className="block font-medium">{p === "flex" ? enquiryCopy.planFlex : enquiryCopy.planNonRef}</span>
                              <span className={cn("block text-xs", p === "flex" && cancelBy ? "text-success" : "text-muted-foreground")}>
                                {p === "flex"
                                  ? cancelBy ? enquiryCopy.freeCancel(formatUkDate(cancelBy)) : enquiryCopy.noFreeCancel
                                  : enquiryCopy.nonRefNote(settings.nonRef.kind === "percent" ? `${settings.nonRef.value}%` : money(planRates(chosen[0]!.ratePence!, settings).flex - (planRates(chosen[0]!.ratePence!, settings).nonref ?? 0), page.currency))}
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums">{money(totals(p), page.currency)}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <div className="flex items-baseline justify-between border-t border-border pt-3">
                      <span className="font-medium">{copy.total}</span>
                      <span className="text-right">
                        <span className="block text-2xl font-semibold">{money(total, page.currency)}</span>
                        {fx ? <span className="block text-xs text-muted-foreground">{enquiryCopy.fxLine(money(convert(total, fx.rate), fx.currency), page.currency, fx.rate, fx.currency)}</span> : null}
                      </span>
                    </div>

                    <fieldset className="space-y-3">
                      <legend className="mb-2 text-sm font-medium">{copy.yourDetails}</legend>
                      <ContactFields value={contact} onChange={setContact} idPrefix="bk" />
                      <div className="space-y-1">
                        <Label htmlFor="bk-country">{enquiryCopy.country}</Label>
                        <select id="bk-country" className="h-12 w-full rounded-xl border border-input bg-surface px-3" value={guestCountry} onChange={(e) => setGuestCountry(e.target.value)}>
                          {phoneCountries().map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.name}</option>)}
                        </select>
                        <p className="text-xs text-muted-foreground">{copy.countryHint}</p>
                      </div>
                    </fieldset>

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">{copy.pay}</legend>
                      <div role="radiogroup" className="grid gap-2">
                        {page.booking.methods.map((m) => (
                          <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={cn("rounded-xl border p-3 text-left text-sm", method === m ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-secondary")}>
                            <span className="block font-medium">{enquiryCopy.methods[m].label}</span>
                            <span className="block text-xs text-muted-foreground">{m === "bank" ? enquiryCopy.methods.bank.help(page.booking.bankPayDays) : enquiryCopy.methods[m].help}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <div className="space-y-1">
                      <Label htmlFor="bk-msg">{enquiryCopy.message}</Label>
                      <Textarea id="bk-msg" rows={2} maxLength={2000} placeholder={enquiryCopy.messagePlaceholder} value={message} onChange={(e) => setMessage(e.target.value)} />
                    </div>
                    {/* Hidden from people; bots fill it in. */}
                    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                      <label>
                        Website <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                      </label>
                    </div>
                    <label className="flex items-start gap-3 rounded-2xl bg-muted p-3 text-sm">
                      <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
                      <span>{enquiryCopy.bookingAgree(page.business)}</span>
                    </label>
                    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                    <Button type="submit" size="lg" className="w-full" disabled={busy || !method}>
                      {busy ? <Loader2 className="animate-spin" /> : <CalendarHeart />} {method === "card" ? enquiryCopy.bookAndPay(money(total, page.currency)) : enquiryCopy.bookNow}
                    </Button>
                    <p className="text-xs text-muted-foreground">{method === "card" ? enquiryCopy.cardNote : enquiryCopy.bookingNote}</p>
                  </form>
                )}
              </section>
            </div>
          </aside>
        </div>

        {/* Direct guests' reviews scoring 9+ out of 10, shared with their agreement (when the host shows them). */}
        {page.reviews.length ? (
          <section aria-labelledby="page-reviews" className={cn("space-y-3", step === "book" && "hidden lg:block")}>
            <div>
              <h2 id="page-reviews" className="text-2xl">{reviewsCopy.title}</h2>
              <p className="text-sm text-muted-foreground">{reviewsCopy.note}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {page.reviews.map((r, i) => (
                <li key={i} className="card-soft space-y-2 p-4">
                  <p className="flex items-center justify-between gap-2">
                    <span className="flex gap-0.5" aria-hidden>
                      {Array.from({ length: 5 }, (_, k) => <Star key={k} className="size-4 fill-amber-400 text-amber-400" />)}
                    </span>
                    <span className="rounded-full bg-primary px-2 py-0.5 text-sm font-semibold text-primary-foreground tabular-nums">{reviewsCopy.score(r.score)}</span>
                  </p>
                  {r.text ? <p className="line-clamp-5 text-sm">“{r.text}”</p> : null}
                  <p className="text-xs text-muted-foreground">{r.name ?? reviewsCopy.guest} · {r.month}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      {/* Phones: what's chosen so far, and on to booking. */}
      {step === "rooms" && chosen.length ? (
        <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg lg:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-muted-foreground">{copy.roomsCount(chosen.length)} · {copy.nightsShort(nights)}</span>
            <span className="block text-lg font-semibold">{money(total, page.currency)}</span>
          </span>
          <Button type="button" size="lg" onClick={() => setStep("book")}>{copy.continue}</Button>
        </div>
      ) : null}

      <EnquiryDialog
        open={enquiry.open}
        onOpenChange={(open) => setEnquiry((e) => ({ ...e, open }))}
        code={page.shortCode}
        business={page.business}
        consent={page.consent}
        today={page.today}
        room={enquiryRoom ? { id: enquiryRoom.id, name: enquiryRoom.name } : null}
        checkIn={stay.checkIn}
        checkOut={stay.checkOut}
        adults={adults}
        children={children}
        estimate={enquiryEstimate ? money(enquiryEstimate.total, page.currency) : null}
        contact={contact}
        onContact={setContact}
      />
    </GuestFrame>
  );
}
