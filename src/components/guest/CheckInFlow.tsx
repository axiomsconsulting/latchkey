import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, CheckCircle2, CircleHelp, HandHeart, Loader2, Minus, Phone, Plus } from "lucide-react";

import { ChannelIcon } from "@/components/ChannelIcon";

import { CheckInQr, KioskQr, GuideLink } from "@/components/guest/CheckInQr";
import { IdCamera } from "@/components/guest/IdCamera";
import { PinPad } from "@/components/guest/PinPad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { guest as copy } from "@/content/copy";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CheckinMethod } from "@/lib/checkin-logic";
import {
  addFacePhoto,
  askHostToCheckIn,
  checkCompanionId,
  completeCheckIn,
  confirmBooking,
  listArrivals,
  matchBooking,
  pickArrival,
  resumeSession,
  selfDeclare,
  setGuestName,
  saveRegister,
  setParty,
  skipCompanionId,
  verifyLast4,
  verifyPhotoId,
} from "@/lib/checkin.functions";

import { formatUkDate, formatUkTime } from "@/lib/dates";
import { demoLine, type DemoHint } from "@/lib/demo-guide";
import { REGISTER_AGE, cleanRegisterEntry, isAlien, nationalityOptions } from "@/lib/hotel-register";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
type Last4Kind = "reference" | "phone" | "email";

export type GuestSite = { key: string; label: string; iconUrl: string | null };

/** Who's staying and what is asked, from the host's settings for this room. */
type PartyPlan = {
  ask: boolean;
  booked: number | null;
  capacity: number | null;
  childrenAllowed: boolean;
  everyAdult: boolean;
  facePhoto: boolean;
  keepIdPhoto: boolean;
  keepDays: number;
  /** UK guest register: name and nationality of everyone 16 or over. */
  register: boolean;
};

/** What the register form starts with, read from the person's own ID. */
type Prefill = {
  fullName: string | null;
  nationality: string | null;
  documentNumber: string | null;
  placeOfIssue: string | null;
};

/** Steps after the lead guest's ID, run in order. */
type After =
  | { kind: "face"; position: number }
  | { kind: "companion"; position: number }
  | { kind: "register"; position: number; child: boolean };

type Step =
  | { name: "welcome" }
  | { name: "letter" }
  | { name: "checkout" }
  /** Only when the first answers fit stays on more than one platform. */
  | { name: "platform"; only: string[] }
  | { name: "pick"; items: Array<{ id: string; label: string; checkOut: string; channel?: string }> }
  | { name: "no_match" }
  | { name: "locked"; until: string }
  | { name: "guestName" }
  | { name: "confirm"; firstName: string; returning?: boolean }
  | { name: "party" }
  | { name: "companion"; position: number; ready: boolean }
  | { name: "face"; position: number }
  | { name: "register"; position: number; child: boolean }
  /** The guest asked the host to check them in; `back` resumes where they were. */
  | { name: "handover"; back: Step }
  | { name: "identity"; method: CheckinMethod; consented: boolean }
  | { name: "done"; firstName: string; roomName: string | null; roomTitle: string | null; stayToken: string };

function deviceId(): string {
  const key = "latchkey.device";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

export type CheckinProperty = {
  name: string;
  code: string;
  checkoutChoices: string[];
  demoHint?: DemoHint | null;
  listFlow: boolean;
  checkInFrom?: string;
  checkOutBy?: string;
  channelLabels?: Record<string, string>;
  sites?: GuestSite[];
};

export function CheckInFlow({
  property,
  hostPhone,
  kiosk = false,
  onActivity,
  resumeToken,
}: {
  property: CheckinProperty;
  hostPhone?: string | null;
  kiosk?: boolean;
  onActivity?: () => void;
  /** Present when the guest scanned the square on another device. */
  resumeToken?: string | null;
}) {
  const [step, setStep] = useState<Step>({ name: "welcome" });
  const [letter, setLetter] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [token, setToken] = useState("");
  const [sequence, setSequence] = useState<CheckinMethod[]>(["self_declare"]);
  const [kinds, setKinds] = useState<Last4Kind[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [plan, setPlan] = useState<PartyPlan | null>(null);
  const [listFlow, setListFlow] = useState(false);
  const [adults, setAdults] = useState(1);
  const [queue, setQueue] = useState<After[]>([]);
  const [prefill, setPrefill] = useState<Record<number, Prefill>>({});
  // Read when the steps after the lead guest are planned, sometimes in the
  // same tap that set them, so kept in a ref rather than state.
  const childAges = useRef<number[]>([]);
  const onPhone = useIsMobile();

  const match = useServerFn(matchBooking);
  const list = useServerFn(listArrivals);
  const pick = useServerFn(pickArrival);
  const confirm = useServerFn(confirmBooking);
  const photo = useServerFn(verifyPhotoId);
  const last4 = useServerFn(verifyLast4);
  const declare = useServerFn(selfDeclare);
  const complete = useServerFn(completeCheckIn);
  const resume = useServerFn(resumeSession);
  const saveName = useServerFn(setGuestName);
  const party = useServerFn(setParty);
  const companionId = useServerFn(checkCompanionId);
  const skipCompanion = useServerFn(skipCompanionId);
  const face = useServerFn(addFacePhoto);
  const register = useServerFn(saveRegister);
  const handover = useServerFn(askHostToCheckIn);
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    onActivity?.();
    setMessage(null);
  }, [step, onActivity]);

  // Scanned square: rejoin the same check-in rather than starting over.
  useEffect(() => {
    if (!resumeToken || kiosk) return;
    let live = true;
    setBusy(true);
    resume({ data: { token: resumeToken } })
      .then(async (res) => {
        if (!live) return;
        setToken(resumeToken);
        setSequence([...res.sequence] as CheckinMethod[]);
        setKinds(res.last4Kinds);
        setPlatform(res.platform);
        setPlan(res.party);
        setListFlow(res.listFlow);
        if (res.adults) setAdults(res.adults);
        if (res.verified && !res.completed) {
          // Identity is done: carry on with only the steps still missing.
          childAges.current = res.childAges;
          const people = res.adults ?? 1;
          const steps: After[] = [];
          for (let i = 0; i < people; i++) {
            if (i > 0 && res.party.everyAdult && !res.idsDone.includes(i)) steps.push({ kind: "companion", position: i });
            if (res.party.register && !res.registered.includes(i)) steps.push({ kind: "register", position: i, child: false });
          }
          res.childAges.forEach((age, i) => {
            if (res.party.register && age >= REGISTER_AGE && !res.registered.includes(people + i)) {
              steps.push({ kind: "register", position: people + i, child: true });
            }
          });
          if (steps.length && live) return void advance(steps);
        }
        if (res.completed || res.verified) {
          const done = await complete({ data: { token: resumeToken } });
          if (live) setStep({ name: "done", ...done });
          return;
        }
        setStep({ name: "confirm", firstName: res.firstName });
      })
      .catch(() => {
        if (live) setMessage(copy.error);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
    // Runs once for the scanned token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeToken, kiosk]);


  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      setMessage(err instanceof Error && err.message.length < 120 ? err.message : copy.error);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setLetter("");
    setCheckOut("");
    setToken("");
    setPlatform(null);
    setPlan(null);
    setAdults(1);
    setQueue([]);
    setPrefill({});
    childAges.current = [];
    setStep({ name: "welcome" });
  }

  /** The host's name and icon for a booking site, or the standard wording. */
  function siteOf(key: string): GuestSite {
    return (
      property.sites?.find((s) => s.key === key) ?? {
        key,
        label: property.channelLabels?.[key] ?? copy.platforms[key] ?? key,
        iconUrl: null,
      }
    );
  }

  /** List flow: every stay with that initial, across platforms. */
  async function listStays(chosenLetter: string) {
    const res = await run(() => list({ data: { code: property.code, deviceId: deviceId(), letter: chosenLetter } }));
    if (!res) return;
    if ("until" in res && res.until) return setStep({ name: "locked", until: res.until });
    setStep({ name: "pick", items: res.items });
  }

  /** Asks for the platform only if the server says the answers so far fit more than one. */
  async function findStay(day: string, channel?: string) {
    const res = await run(() =>
      match({ data: { code: property.code, deviceId: deviceId(), letter, checkOut: day, ...(channel ? { channel } : {}) } }),
    );
    if (!res) return;
    if (res.status === "locked") return setStep({ name: "locked", until: res.until });
    if (res.status === "no_match") return setStep({ name: "no_match" });
    if (res.status === "choose_platform") return setStep({ name: "platform", only: res.channels });
    setToken(res.token);
    setPlatform(res.platform);
    if (res.needsName) return setStep({ name: "guestName" });
    setStep({ name: "confirm", firstName: res.firstName, returning: res.returning === true });
  }

  async function onGuestName(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() => saveName({ data: { token, fullName } }));
    if (res) setStep({ name: "confirm", firstName: res.firstName });
  }

  async function onPick(bookingId: string) {
    const res = await run(() => pick({ data: { code: property.code, deviceId: deviceId(), bookingId, letter } }));
    if (!res) return;
    setToken(res.token);
    setPlatform(res.platform);
    setStep({ name: "confirm", firstName: res.firstName });
  }

  async function finish() {
    const res = await run(() => complete({ data: { token } }));
    if (res) setStep({ name: "done", ...res });
  }

  async function onConfirm() {
    const res = await run(() => confirm({ data: { token } }));
    if (!res) return;
    const seq = [...res.sequence] as CheckinMethod[];
    setSequence(seq);
    setKinds(res.last4Kinds);
    setPlan(res.party);
    setListFlow(res.listFlow);
    if (res.party.ask) {
      setAdults(Math.max(1, res.party.booked ?? 1));
      return setStep({ name: "party" });
    }
    await startIdentity(res.listFlow, seq, 1, res.party);
  }

  async function startIdentity(list = listFlow, seq = sequence, people = adults, p = plan) {
    if (list) {
      const ok = await run(() => declare({ data: { token } }));
      if (ok) afterLead(people, p);
      return;
    }
    setStep({ name: "identity", method: seq[0] ?? "self_declare", consented: false });
  }

  async function onParty(nextAdults: number, ages: number[]) {
    const res = await run(() => party({ data: { token, adults: nextAdults, childAges: ages } }));
    if (!res) return;
    setAdults(nextAdults);
    childAges.current = ages;
    await startIdentity(listFlow, sequence, nextAdults);
  }

  /**
   * After the lead guest: their register entry and face photo, then each
   * other adult's ID, register entry and face, then any 16 or 17 year olds'
   * register entries.
   */
  function afterLead(people = adults, p = plan) {
    const steps: After[] = [];
    if (p?.register) steps.push({ kind: "register", position: 0, child: false });
    if (p?.facePhoto) steps.push({ kind: "face", position: 0 });
    for (let i = 1; i < people; i++) {
      if (p?.everyAdult) steps.push({ kind: "companion", position: i });
      if (p?.register) steps.push({ kind: "register", position: i, child: false });
      if (p?.facePhoto) steps.push({ kind: "face", position: i });
    }
    if (p?.register) {
      childAges.current.forEach((age, i) => {
        if (age >= REGISTER_AGE) steps.push({ kind: "register", position: people + i, child: true });
      });
    }
    void advance(steps);
  }

  async function advance(steps: After[], note?: string) {
    const [next, ...rest] = steps;
    setQueue(rest);
    if (!next) {
      await finish();
    } else if (next.kind === "face") {
      setStep({ name: "face", position: next.position });
    } else if (next.kind === "register") {
      setStep({ name: "register", position: next.position, child: next.child });
    } else {
      setStep({ name: "companion", position: next.position, ready: false });
    }
    if (note) setTimeout(() => setMessage(note), 0);
  }

  async function onCompanion(position: number, full: string, small: string) {
    const res = await run(() =>
      companionId({ data: { token, position, image: full, ...(plan?.keepIdPhoto ? { small } : {}) } }),
    );
    if (!res) return;
    if (res.status === "retry") {
      return setMessage(res.reason === "not_photo_id" ? copy.idNotPhotoId : copy.idRetryPlain);
    }
    if (res.status === "skip") {
      const ok = await run(() => skipCompanion({ data: { token, position } }));
      if (ok) await advance(queue, copy.companionSkipped);
      return;
    }
    setPrefill((p) => ({ ...p, [position]: res.prefill }));
    await advance(queue, res.under18 ? copy.companionUnder18 : copy.companionThanks(res.firstName));
  }

  async function onRegister(position: number, entry: RegisterForm) {
    const res = await run(() => register({ data: { token, position, ...entry } }));
    if (!res) return;
    if (!res.ok) return setMessage(res.missing.map((m) => copy.registerMissing[m]).join(" "));
    await advance(queue);
  }

  async function onSkipCompanion(position: number) {
    const ok = await run(() => skipCompanion({ data: { token, position } }));
    if (ok) await advance(queue, copy.companionSkipped);
  }

  async function onFace(position: number, small: string) {
    const ok = await run(() => face({ data: { token, position, image: small } }));
    if (ok) await advance(queue);
  }

  function fallback(from: CheckinMethod, note?: string) {
    const i = sequence.indexOf(from);
    const next = sequence[Math.min(i + 1, sequence.length - 1)] ?? "self_declare";
    setStep({ name: "identity", method: next, consented: false });
    if (note) setTimeout(() => setMessage(note), 0);
  }

  async function onPhoto(full: string, small: string) {
    const res = await run(() => photo({ data: { token, image: full, ...(plan?.keepIdPhoto ? { small } : {}) } }));
    if (!res) return fallback("photo_id");
    if (res.status === "retry") {
      return setMessage(res.reason === "not_photo_id" ? `${copy.idNotPhotoId} ${copy.idTriesLeft(res.left)}` : copy.idRetry(res.left));
    }
    if (res.status === "fallback") return fallback("photo_id");
    setPrefill((p) => ({ ...p, 0: res.prefill }));
    afterLead();
  }

  const lockedTime = step.name === "locked" ? formatUkTime(new Date(step.until).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })) : "";

  // Shared demo only: tell visitors the fake guest's answers for the step they're on.
  // Public demo only: a line for whichever screen is showing, so the
  // guidance follows the flow as steps appear or are skipped.
  const hint = property.demoHint;
  const demoHint = hint ? demoLine(step, hint, siteOf(hint.channel).label) : null;

  const canGoBack = ["letter", "checkout", "platform", "pick", "guestName"].includes(step.name);
  // Every step between the welcome and the end offers a way out to the host.
  const canHandOver = !["welcome", "done", "handover", "locked"].includes(step.name);

  async function handOver() {
    const back = step;
    // The host is told even if this call fails, so never leave the guest stuck.
    await run(() => handover({ data: { code: property.code, ...(token ? { token } : {}) } }));
    setStep({ name: "handover", back });
  }

  // On a tablet or computer at the door, guests can use their own phone instead.
  const kioskWide = kiosk && !onPhone;
  const phoneUrl = typeof window === "undefined" ? "" : `${window.location.origin}/p/${property.code}`;

  // The square only means something once there is a stay to carry across.
  const handoffUrl =
    typeof window === "undefined"
      ? null
      : step.name === "done"
        ? null // The guest guide link and its QR sit on the done screen itself.
        : token
          ? `${window.location.origin}/p/${property.code}?resume=${encodeURIComponent(token)}`
          : null;

  return (
    <div className={cn("mx-auto w-full", kiosk ? "max-w-6xl py-6" : "max-w-6xl py-8")}>
      {canGoBack ? (
        <Button
          variant="ghost"
          size="lg"
          className="mb-4"
          onClick={() =>
            setStep(
              step.name === "letter"
                ? { name: "welcome" }
                : step.name === "checkout" || step.name === "pick"
                  ? { name: "letter" }
                  : { name: "checkout" },
            )
          }
        >
          <ArrowLeft className="size-5" /> {copy.back}
        </Button>
      ) : null}

      <div
        className={cn(
          "grid gap-6",
          kioskWide && step.name === "welcome"
            ? "md:grid-cols-[minmax(0,1fr)_20rem] md:items-center"
            : handoffUrl && !onPhone && !kiosk
              ? "lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"
              : "",
        )}
      >


      <main className="card-soft p-6 sm:p-10" aria-live="polite">
        {demoHint ? (
          <p className="mb-6 rounded-2xl bg-secondary px-4 py-3 text-center text-base">{demoHint}</p>
        ) : null}
        {step.name === "welcome" ? (
          <div className="py-6 text-center">
            <h1 className="text-3xl leading-tight sm:text-5xl">{copy.welcomeTo(property.name)}</h1>
            <p className="mt-4 text-xl text-muted-foreground sm:text-2xl">{copy.letsCheckIn}</p>
            <Button
              size="touch-xl"
              className="mt-10 w-full max-w-md text-xl"
              onClick={() => setStep({ name: "letter" })}
            >
              {copy.startCta}
            </Button>
            {property.checkInFrom && property.checkOutBy ? (
              <p className="mt-6 text-muted-foreground">{copy.stayWindow(property.checkInFrom, property.checkOutBy)}</p>
            ) : null}
          </div>
        ) : null}

        {step.name === "letter" ? (
          <section>
            <h1 className="text-2xl sm:text-4xl">{copy.stepLetter}</h1>
            <p className="mt-2 text-muted-foreground">{copy.stepLetterHint}</p>
            <div className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-7 lg:grid-cols-9">
              {LETTERS.map((l) => (
                <Button
                  key={l}
                  variant="outline"
                  size="touch"
                  className="text-2xl font-semibold"
                  disabled={busy}
                  onClick={() => {
                    setLetter(l);
                    if (property.listFlow) void listStays(l);
                    else setStep({ name: "checkout" });
                  }}
                >
                  {l}
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        {step.name === "checkout" ? (
          <section>
            <h1 className="text-2xl sm:text-4xl">{copy.stepCheckout}</h1>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {property.checkoutChoices.map((d) => (
                <Button
                  key={d}
                  variant="outline"
                  size="touch-xl"
                  className="text-xl"
                  disabled={busy}
                  onClick={() => {
                    setCheckOut(d);
                    void findStay(d);
                  }}
                >
                  {formatUkDate(d)}
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        {step.name === "platform" ? (
          <section>
            <h1 className="text-2xl sm:text-4xl">{copy.stepPlatform}</h1>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {step.only.map(siteOf).map((site) => (
                <Button
                  key={site.key}
                  variant="outline"
                  size="touch-xl"
                  className="justify-start gap-4 text-xl"
                  disabled={busy}
                  onClick={() => void findStay(checkOut, site.key)}
                >
                  <ChannelIcon channel={site.key} iconUrl={site.iconUrl} label={site.label} />
                  {site.label}
                </Button>
              ))}
            </div>
            {busy ? <Loader2 className="mx-auto mt-6 size-8 animate-spin text-muted-foreground" /> : null}
          </section>
        ) : null}

        {step.name === "pick" ? (
          <section>
            <h1 className="text-2xl sm:text-4xl">{copy.stepPickBooking}</h1>
            {step.items.length === 0 ? (
              <p className="mt-6 text-lg text-muted-foreground">{copy.noArrivals}</p>
            ) : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {step.items.map((i) => (
                  <Button
                    key={i.id}
                    variant="outline"
                    size="touch-xl"
                    className="flex-col gap-0 text-xl"
                    disabled={busy}
                    onClick={() => void onPick(i.id)}
                  >
                    <span className="flex items-center gap-2">
                      {i.channel ? (
                        <ChannelIcon channel={i.channel} iconUrl={siteOf(i.channel).iconUrl} label={siteOf(i.channel).label} size="1em" />
                      ) : null}
                      {i.label}
                    </span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {copy.stayCheckout} {formatUkDate(i.checkOut)}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {step.name === "no_match" ? (
          <section className="py-4 text-center">
            <h1 className="text-2xl sm:text-4xl">{copy.noMatchTitle}</h1>
            <p className="mx-auto mt-4 max-w-prose text-lg text-muted-foreground">{copy.noMatchBody}</p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Button size="touch-xl" className="w-full max-w-md" onClick={() => setStep({ name: "letter" })}>
                {copy.startAgain}
              </Button>
              <HostCall phone={hostPhone} />
            </div>
          </section>
        ) : null}

        {step.name === "locked" ? (
          <section className="py-4 text-center">
            <h1 className="text-2xl sm:text-4xl">{copy.lockedTitle}</h1>
            <p className="mx-auto mt-4 max-w-prose text-lg text-muted-foreground">{copy.lockedBody(lockedTime)}</p>
            <div className="mt-8 flex justify-center">
              <HostCall phone={hostPhone} />
            </div>
          </section>
        ) : null}

        {step.name === "guestName" ? (
          <section className="mx-auto max-w-xl">
            <h1 className="text-2xl sm:text-4xl">{copy.nameTitle}</h1>
            <p className="mt-2 text-muted-foreground">{copy.nameHint}</p>
            <form className="mt-6 space-y-4" onSubmit={(e) => void onGuestName(e)}>
              <Input
                aria-label={copy.nameTitle}
                className="h-16 text-2xl"
                autoComplete="name"
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <Button type="submit" size="touch-xl" className="w-full" disabled={busy || fullName.trim().split(/\s+/).length < 2}>
                {busy ? <Loader2 className="size-6 animate-spin" /> : null}
                {copy.nameCta}
              </Button>
            </form>
          </section>
        ) : null}

        {step.name === "confirm" ? (
          <section className="py-4 text-center">
            <h1 className="text-4xl sm:text-6xl">{step.returning ? copy.welcomeBack(step.firstName) : copy.hi(step.firstName)}</h1>
            <p className="mt-4 text-xl text-muted-foreground">
              {step.returning ? (
                copy.welcomeBackBody
              ) : platform && !(platform === "other" && siteOf(platform).label === copy.platforms["other"]) ? (
                <ConfirmOnSite site={siteOf(platform)} />
              ) : (
                copy.confirmBody
              )}
            </p>
            <div className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
              <Button size="touch-xl" onClick={() => void onConfirm()} disabled={busy}>
                {busy ? <Loader2 className="size-6 animate-spin" /> : null}
                {copy.confirmYes}
              </Button>
              <Button size="touch-xl" variant="outline" onClick={restart} disabled={busy}>
                {copy.confirmNo}
              </Button>
            </div>
          </section>
        ) : null}

        {step.name === "identity" && step.method === "photo_id" ? (
          <section className="mx-auto max-w-xl">
            <h1 className="text-2xl sm:text-4xl">{copy.idTitle}</h1>
            {!step.consented ? (
              <>
                <p className="mt-4 text-lg">{copy.idConsentLead}</p>
                <WhyAsk>{plan?.keepIdPhoto ? copy.idConsentPhoto(plan.keepDays) : copy.idConsentDetails(plan?.keepDays ?? 30)}</WhyAsk>
                <div className="mt-8 grid gap-3">
                  <Button size="touch-xl" onClick={() => setStep({ ...step, consented: true })}>
                    {copy.idConsentAgree}
                  </Button>
                  <Button size="touch" variant="outline" onClick={() => fallback("photo_id")}>
                    {copy.idUseOther}
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-6">
                <IdCamera
                  busy={busy}
                  onCapture={(full, small) => void onPhoto(full, small)}
                  onFail={() => fallback("photo_id", copy.idCameraFailed)}
                />
                <Button variant="ghost" size="lg" className="mt-3 w-full" onClick={() => fallback("photo_id")}>
                  {copy.idUseOther}
                </Button>
              </div>
            )}
          </section>
        ) : null}

        {step.name === "identity" && step.method === "last4" ? (
          <Last4Step
            kinds={kinds}
            busy={busy}
            onSubmit={async (kind, value) => {
              const res = await run(() => last4({ data: { token, kind, value } }));
              if (!res) return;
              if (res.status === "retry") return setMessage(copy.last4Retry(res.left));
              if (res.status === "fallback") return fallback("last4");
              afterLead();
            }}
            onOther={() => fallback("last4")}
          />
        ) : null}

        {step.name === "identity" && step.method === "self_declare" ? (
          <section className="mx-auto max-w-xl">
            <h1 className="text-2xl sm:text-4xl">{copy.selfTitle}</h1>
            <p className="mt-4 text-lg">{copy.selfBody}</p>
            <p className="mt-4 rounded-2xl bg-secondary p-4 text-secondary-foreground">{copy.selfNote}</p>
            <Button
              size="touch-xl"
              className="mt-8 w-full"
              disabled={busy}
              onClick={async () => {
                const ok = await run(() => declare({ data: { token } }));
                if (ok) afterLead();
              }}
            >
              {busy ? <Loader2 className="size-6 animate-spin" /> : null}
              {copy.selfConfirm}
            </Button>
          </section>
        ) : null}

        {step.name === "party" && plan ? (
          <PartyStep plan={plan} initialAdults={adults} busy={busy} onSubmit={(a, ages) => void onParty(a, ages)} />
        ) : null}

        {step.name === "companion" ? (
          <section className="mx-auto max-w-xl">
            <h1 className="text-2xl sm:text-4xl">{copy.companionTitle(step.position + 1, adults)}</h1>
            {!step.ready ? (
              <>
                <p className="mt-4 text-lg">{copy.companionBody}</p>
                <p className="mt-2 text-muted-foreground">{copy.companionConsentLead}</p>
                <WhyAsk>{plan?.keepIdPhoto ? copy.idConsentPhoto(plan.keepDays) : copy.idConsentDetails(plan?.keepDays ?? 30)}</WhyAsk>
                <div className="mt-8 grid gap-3">
                  <Button size="touch-xl" onClick={() => setStep({ ...step, ready: true })}>
                    {copy.companionReady}
                  </Button>
                  <Button size="touch" variant="outline" disabled={busy} onClick={() => void onSkipCompanion(step.position)}>
                    {copy.companionSkip}
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-6">
                <IdCamera
                  key={`companion-${step.position}`}
                  busy={busy}
                  onCapture={(full, small) => void onCompanion(step.position, full, small)}
                  onFail={() => void onSkipCompanion(step.position)}
                />
                <Button variant="ghost" size="lg" className="mt-3 w-full" disabled={busy} onClick={() => void onSkipCompanion(step.position)}>
                  {copy.companionSkip}
                </Button>
              </div>
            )}
          </section>
        ) : null}

        {step.name === "register" ? (
          <RegisterStep
            key={`register-${step.position}`}
            title={
              step.child
                ? copy.registerTitleChild
                : step.position === 0
                  ? prefill[0]?.fullName
                    ? copy.registerTitleYou
                    : copy.registerTitleBlank
                  : copy.registerTitleAdult(step.position + 1)
            }
            lead={step.position === 0 ? copy.registerLead : copy.registerLeadOther}
            prefill={prefill[step.position] ?? null}
            busy={busy}
            onSubmit={(entry) => void onRegister(step.position, entry)}
          />
        ) : null}

        {step.name === "face" ? (
          <section className="mx-auto max-w-xl">
            <h1 className="text-2xl sm:text-4xl">
              {step.position === 0 ? copy.faceTitle : copy.faceTitleOther(step.position + 1)}
            </h1>
            <div className="mt-6">
              <IdCamera
                key={`face-${step.position}`}
                facing="user"
                busy={busy}
                help={copy.faceBody}
                cta={copy.faceTake}
                busyLabel={copy.faceSaving}
                onCapture={(_full, small) => void onFace(step.position, small)}
                onFail={() => void advance(queue)}
              />
              <Button variant="ghost" size="lg" className="mt-3 w-full" disabled={busy} onClick={() => void advance(queue)}>
                {copy.faceSkip}
              </Button>
            </div>
          </section>
        ) : null}

        {step.name === "handover" ? (
          <section className="py-4 text-center">
            <HandHeart className="mx-auto size-14 text-primary" />
            <h1 className="mt-4 text-2xl sm:text-4xl">{copy.handoverTitle}</h1>
            <p className="mx-auto mt-4 max-w-prose text-lg text-muted-foreground">{copy.handoverBody}</p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <HostCall phone={hostPhone} />
              <Button size="touch" variant="ghost" className="w-full max-w-md" onClick={() => setStep(step.back)}>
                {copy.handoverResume}
              </Button>
            </div>
          </section>
        ) : null}

        {step.name === "done" ? (
          <section className="py-4 text-center">
            <CheckCircle2 className="mx-auto size-14 text-success" />
            <h1 className="mt-4 text-3xl sm:text-5xl">{copy.doneTitle(step.firstName)}</h1>
            <p className="mt-4 text-2xl">
              {step.roomName ? copy.roomLine(step.roomName, step.roomTitle) : copy.noRoom}
            </p>
            <Button asChild size="touch-xl" className="mt-10 w-full max-w-md text-xl">
              <Link to="/stay/$token" params={{ token: step.stayToken }}>
                <BookOpen className="size-6" /> {copy.stayGuideCta}
              </Link>
            </Button>
            {typeof window !== "undefined" ? (
              <GuideLink url={`${window.location.origin}/stay/${step.stayToken}`} kiosk={kiosk} />
            ) : null}
          </section>
        ) : null}

        {message ? (
          <p role="alert" className="mt-6 rounded-xl bg-accent/10 p-4 text-center text-lg text-foreground">
            {message}
          </p>
        ) : null}

        {canHandOver ? (
          <div className="mt-8 border-t border-border pt-4 text-center">
            <Button variant="ghost" size="lg" className="text-muted-foreground" disabled={busy} onClick={() => void handOver()}>
              <HandHeart className="size-5" /> {copy.handoverCta}
            </Button>
          </div>
        ) : null}
        </main>

        {/* Front-door tablet: the phone square sits beside the welcome, then in the corner. */}
        {kioskWide && step.name !== "done" ? (
          <KioskQr url={handoffUrl ?? phoneUrl} large={step.name === "welcome"} carryOn={!!handoffUrl} />
        ) : null}
        {handoffUrl && !kiosk ? (
          <CheckInQr
            url={handoffUrl}
            heading={step.name === "done" ? copy.qrDoneHeading : copy.qrHeading}
            blurb={step.name === "done" ? copy.qrDoneBlurb : copy.qrBlurb}
            compact={onPhone}
          />
        ) : null}
      </div>
    </div>

  );
}

function HostCall({ phone }: { phone?: string | null | undefined }) {
  if (!phone) return null;
  return (
    <Button asChild size="touch" variant="outline" className="w-full max-w-md">
      <a href={`tel:${phone.replace(/\s+/g, "")}`}>
        <Phone className="size-5" /> {copy.callHost}
      </a>
    </Button>
  );
}

function Last4Step({
  kinds,
  busy,
  onSubmit,
  onOther,
}: {
  kinds: Last4Kind[];
  busy: boolean;
  onSubmit: (kind: Last4Kind, value: string) => Promise<void>;
  onOther: () => void;
}) {
  const [kind, setKind] = useState<Last4Kind>(kinds[0] ?? "reference");
  const [value, setValue] = useState("");
  const isEmail = kind === "email";
  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-2xl sm:text-4xl">{copy.last4Title}</h1>
      {kinds.length > 1 ? (
        <div className="mt-6 grid gap-2">
          {kinds.map((k) => (
            <Button
              key={k}
              variant={k === kind ? "default" : "outline"}
              size="touch"
              className="h-auto min-h-16 whitespace-normal py-3"
              onClick={() => {
                setKind(k);
                setValue("");
              }}
            >
              {copy.last4Kinds[k]}
            </Button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-lg">{copy.last4Kinds[kind]}</p>
      )}
      {kind === "phone" ? (
        <div className="mt-6">
          <PinPad
            value={value}
            onChange={setValue}
            length={4}
            busy={busy}
            onComplete={(v) => void onSubmit(kind, v)}
          />
          {busy ? <Loader2 className="mx-auto mt-4 size-6 animate-spin text-muted-foreground" /> : null}
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(kind, value);
          }}
        >
          <Input
            aria-label={copy.last4Kinds[kind]}
            className="h-16 text-center text-2xl tracking-widest"
            value={value}
            inputMode={isEmail ? "email" : "text"}
            autoComplete="off"
            maxLength={isEmail ? 254 : 4}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" size="touch-xl" className="w-full" disabled={busy || value.trim().length < 4}>
            {busy ? <Loader2 className="size-6 animate-spin" /> : null}
            {copy.last4Submit}
          </Button>
        </form>
      )}
      <Button variant="ghost" size="lg" className="mt-3 w-full" onClick={onOther}>
        {copy.idUseOther}
      </Button>
    </section>
  );
}

/** "Is this your [icon] Airbnb booking?", with the icon sized to the line. */
function ConfirmOnSite({ site }: { site: GuestSite }) {
  return (
    <>
      {copy.confirmOnSite.before}{" "}
      <span className="inline-flex items-baseline gap-[0.3em] whitespace-nowrap font-medium text-foreground">
        <span className="self-center">
          <ChannelIcon channel={site.key} iconUrl={site.iconUrl} label={site.label} size="1.15em" />
        </span>
        {/* The standard "Booked directly" reads badly mid-sentence. */}
        {site.key === "direct" && site.label === copy.platforms["direct"] ? copy.confirmDirect : site.label}
      </span>{" "}
      {copy.confirmOnSite.after}
    </>
  );
}

function Counter({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
      <div>
        <p className="text-xl font-medium">{label}</p>
        <p className="text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-14 rounded-full"
          aria-label={copy.partyLess(label)}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="size-6" />
        </Button>
        <span className="w-10 text-center text-3xl tabular-nums" aria-live="polite">
          {value}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-14 rounded-full"
          aria-label={copy.partyMore(label)}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-6" />
        </Button>
      </div>
    </div>
  );
}

/** How many adults and children, and each child's age. Never blocks the guest. */
function PartyStep({
  plan,
  initialAdults,
  busy,
  onSubmit,
}: {
  plan: PartyPlan;
  initialAdults: number;
  busy: boolean;
  onSubmit: (adults: number, childAges: number[]) => void;
}) {
  const [adults, setAdults] = useState(initialAdults);
  const [ages, setAges] = useState<Array<number | null>>([]);
  const total = adults + ages.length;
  const missingAge = ages.some((a) => a === null);
  const notes = [
    plan.booked !== null && plan.booked !== total ? copy.partyDiffers(plan.booked, total) : null,
    plan.capacity !== null && total > plan.capacity ? copy.partyOver(plan.capacity) : null,
  ].filter((n): n is string => !!n);

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-2xl sm:text-4xl">{copy.partyTitle}</h1>
      <p className="mt-2 text-muted-foreground">
        {copy.partyBody}
        {plan.booked !== null ? ` ${copy.partyBooked(plan.booked)}` : ""}
      </p>
      <div className="mt-6 space-y-3">
        <Counter label={copy.partyAdults} hint={copy.partyAdultsHint} value={adults} min={1} max={30} onChange={setAdults} />
        {plan.childrenAllowed ? (
          <Counter
            label={copy.partyChildren}
            hint={copy.partyChildrenHint}
            value={ages.length}
            min={0}
            max={29}
            onChange={(n) => setAges((a) => (n > a.length ? [...a, null] : a.slice(0, n)))}
          />
        ) : (
          <p className="rounded-2xl bg-secondary p-4 text-secondary-foreground">{copy.partyAdultsOnly}</p>
        )}
      </div>

      {ages.length > 0 ? (
        <div className="mt-6">
          <p className="text-muted-foreground">{plan.register ? copy.partyChildAgeHintRegister : copy.partyChildAgeHint}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ages.map((age, i) => (
              <div key={i} className="space-y-1">
                <label className="text-sm text-muted-foreground" htmlFor={`child-age-${i}`}>
                  {copy.partyChildAge(i + 1)}
                </label>
                <Select
                  value={age === null ? "" : String(age)}
                  onValueChange={(v) => setAges((a) => a.map((x, j) => (j === i ? Number(v) : x)))}
                >
                  <SelectTrigger id={`child-age-${i}`} className="h-14 text-xl">
                    <SelectValue placeholder={copy.partyAgePick} />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 18 }, (_, n) => (
                      <SelectItem key={n} value={String(n)} className="text-lg">
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {notes.length ? (
        <div className="mt-6 space-y-2">
          {notes.map((n) => (
            <p key={n} className="rounded-2xl bg-secondary p-4 text-secondary-foreground">
              {n}
            </p>
          ))}
        </div>
      ) : null}

      <Button
        size="touch-xl"
        className="mt-8 w-full"
        disabled={busy || missingAge}
        onClick={() => onSubmit(adults, ages.filter((a): a is number => a !== null))}
      >
        {busy ? <Loader2 className="size-6 animate-spin" /> : null}
        {missingAge ? copy.partyAgesMissing : copy.partyContinue}
      </Button>
    </section>
  );
}

type RegisterForm = {
  fullName: string;
  nationality: string;
  documentNumber: string | null;
  placeOfIssue: string | null;
  nextDestination: string | null;
  nextAddress: string | null;
};

/**
 * The UK guest register entry for one person: name and nationality, and for
 * guests who aren't British, Irish or Commonwealth citizens, their passport
 * or ID details and where they're going next. Prefilled from their ID.
 */
function RegisterStep({
  title,
  lead,
  prefill,
  busy,
  onSubmit,
}: {
  title: string;
  lead: string;
  prefill: Prefill | null;
  busy: boolean;
  onSubmit: (entry: RegisterForm) => void;
}) {
  const [fullName, setFullName] = useState(prefill?.fullName ?? "");
  const [nationality, setNationality] = useState(prefill?.nationality ?? "");
  const [documentNumber, setDocumentNumber] = useState(prefill?.documentNumber ?? "");
  const [placeOfIssue, setPlaceOfIssue] = useState(prefill?.placeOfIssue ?? "");
  const [nextDestination, setNextDestination] = useState("");
  const [nextAddress, setNextAddress] = useState("");
  const options = nationalityOptions();
  const alien = !!nationality && isAlien(nationality);
  const entry: RegisterForm = {
    fullName,
    nationality,
    documentNumber: alien ? documentNumber : null,
    placeOfIssue: alien ? placeOfIssue : null,
    nextDestination: alien ? nextDestination : null,
    nextAddress: alien ? nextAddress : null,
  };
  const ready = cleanRegisterEntry(entry).ok;

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-2xl sm:text-4xl">{title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{lead}</p>
      <WhyAsk>{copy.registerWhy}</WhyAsk>
      {prefill?.fullName ? <p className="mt-3 text-sm text-muted-foreground">{copy.registerFromId}</p> : null}
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(entry);
        }}
      >
        <div className="space-y-1">
          <label htmlFor="reg-name" className="text-lg">
            {copy.registerName}
          </label>
          <Input
            id="reg-name"
            className="h-14 text-xl"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">{copy.registerNameHint}</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="reg-nationality" className="text-lg">
            {copy.registerNationality}
          </label>
          <Select value={nationality} onValueChange={setNationality}>
            <SelectTrigger id="reg-nationality" className="h-14 text-xl">
              <SelectValue placeholder={copy.registerPick} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {options.map((o) => (
                <SelectItem key={o.code} value={o.code} className="text-lg">
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {alien ? (
          <>
            <div>
              <p className="text-lg">{copy.registerAlienLead}</p>
              <WhyAsk>{copy.registerAlienWhy}</WhyAsk>
            </div>
            <div className="space-y-1">
              <label htmlFor="reg-doc" className="text-lg">
                {copy.registerDocNumber}
              </label>
              <Input
                id="reg-doc"
                className="h-14 text-xl uppercase"
                autoComplete="off"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="reg-place" className="text-lg">
                {copy.registerPlace}
              </label>
              <Input id="reg-place" className="h-14 text-xl" value={placeOfIssue} onChange={(e) => setPlaceOfIssue(e.target.value)} />
              <p className="text-sm text-muted-foreground">{copy.registerPlaceHint}</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="reg-next" className="text-lg">
                {copy.registerNext}
              </label>
              <Input id="reg-next" className="h-14 text-xl" value={nextDestination} onChange={(e) => setNextDestination(e.target.value)} />
              <p className="text-sm text-muted-foreground">{copy.registerNextHint}</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="reg-address" className="text-lg">
                {copy.registerAddress}
              </label>
              <Input id="reg-address" className="h-14 text-xl" value={nextAddress} onChange={(e) => setNextAddress(e.target.value)} />
            </div>
          </>
        ) : null}

        <Button type="submit" size="touch-xl" className="w-full" disabled={busy || !ready}>
          {busy ? <Loader2 className="size-6 animate-spin" /> : null}
          {copy.registerSave}
        </Button>
      </form>
    </section>
  );
}

/**
 * A small "Why do we ask?" that opens the reason in plain words, so each
 * step leads with the question and the legal detail is there for anyone
 * who wants it.
 */
function WhyAsk({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleHelp className="size-4" /> {copy.whyAsk}
      </button>
      {open ? (
        <div className="mt-1 rounded-2xl bg-secondary p-4 text-secondary-foreground animate-in fade-in slide-in-from-top-1">
          <p>{children}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.whyAskClose}
          </button>
        </div>
      ) : null}
    </div>
  );
}
