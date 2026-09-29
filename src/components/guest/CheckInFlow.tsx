import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, CheckCircle2, Loader2, Phone } from "lucide-react";

import { IdCamera } from "@/components/guest/IdCamera";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guest as copy } from "@/content/copy";
import type { CheckinMethod } from "@/lib/checkin-logic";
import {
  completeCheckIn,
  confirmBooking,
  listArrivals,
  matchBooking,
  pickArrival,
  selfDeclare,
  verifyLast4,
  verifyPhotoId,
} from "@/lib/checkin.functions";
import { formatUkDate, formatUkTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const PLATFORMS = ["airbnb", "booking_com", "homestay", "direct", "other"] as const;
type Platform = (typeof PLATFORMS)[number];
type Last4Kind = "reference" | "phone" | "email";

type Step =
  | { name: "welcome" }
  | { name: "letter" }
  | { name: "checkout" }
  | { name: "platform" }
  | { name: "pick"; items: Array<{ id: string; label: string; checkOut: string }> }
  | { name: "no_match" }
  | { name: "locked"; until: string }
  | { name: "confirm"; firstName: string }
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
  listFlow: boolean;
};

export function CheckInFlow({
  property,
  hostPhone,
  kiosk = false,
  onActivity,
}: {
  property: CheckinProperty;
  hostPhone?: string | null;
  kiosk?: boolean;
  onActivity?: () => void;
}) {
  const [step, setStep] = useState<Step>({ name: "welcome" });
  const [letter, setLetter] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [token, setToken] = useState("");
  const [sequence, setSequence] = useState<CheckinMethod[]>(["self_declare"]);
  const [kinds, setKinds] = useState<Last4Kind[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const match = useServerFn(matchBooking);
  const list = useServerFn(listArrivals);
  const pick = useServerFn(pickArrival);
  const confirm = useServerFn(confirmBooking);
  const photo = useServerFn(verifyPhotoId);
  const last4 = useServerFn(verifyLast4);
  const declare = useServerFn(selfDeclare);
  const complete = useServerFn(completeCheckIn);

  useEffect(() => {
    onActivity?.();
    setMessage(null);
  }, [step, onActivity]);

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
    setStep({ name: "welcome" });
  }

  async function onPlatform(channel: Platform) {
    if (property.listFlow) {
      const res = await run(() => list({ data: { code: property.code, deviceId: deviceId(), channel } }));
      if (!res) return;
      if ("until" in res && res.until) return setStep({ name: "locked", until: res.until });
      return setStep({ name: "pick", items: res.items });
    }
    const res = await run(() =>
      match({ data: { code: property.code, deviceId: deviceId(), letter, checkOut, channel } }),
    );
    if (!res) return;
    if (res.status === "locked") return setStep({ name: "locked", until: res.until });
    if (res.status === "no_match") return setStep({ name: "no_match" });
    setToken(res.token);
    setStep({ name: "confirm", firstName: res.firstName });
  }

  async function onPick(bookingId: string) {
    const res = await run(() => pick({ data: { code: property.code, deviceId: deviceId(), bookingId } }));
    if (!res) return;
    setToken(res.token);
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
    if (res.listFlow) {
      const ok = await run(() => declare({ data: { token } }));
      if (ok) await finish();
      return;
    }
    setStep({ name: "identity", method: seq[0] ?? "self_declare", consented: false });
  }

  function fallback(from: CheckinMethod, note?: string) {
    const i = sequence.indexOf(from);
    const next = sequence[Math.min(i + 1, sequence.length - 1)] ?? "self_declare";
    setStep({ name: "identity", method: next, consented: false });
    if (note) setTimeout(() => setMessage(note), 0);
  }

  async function onPhoto(dataUrl: string) {
    const res = await run(() => photo({ data: { token, image: dataUrl } }));
    if (!res) return fallback("photo_id");
    if (res.status === "retry") return setMessage(copy.idRetry(res.left));
    if (res.status === "fallback") return fallback("photo_id");
    await finish();
  }

  const lockedTime = step.name === "locked" ? formatUkTime(new Date(step.until).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })) : "";

  const canGoBack = ["letter", "checkout", "platform", "pick"].includes(step.name);

  return (
    <div className={cn("mx-auto w-full max-w-4xl", kiosk ? "py-6" : "py-8")}>
      {canGoBack ? (
        <Button
          variant="ghost"
          size="lg"
          className="mb-4"
          onClick={() =>
            setStep(
              step.name === "letter" || (step.name === "platform" && property.listFlow)
                ? { name: "welcome" }
                : step.name === "checkout"
                  ? { name: "letter" }
                  : step.name === "platform"
                    ? { name: "checkout" }
                    : { name: "platform" },
            )
          }
        >
          <ArrowLeft className="size-5" /> {copy.back}
        </Button>
      ) : null}

      <main className="card-soft p-6 sm:p-10" aria-live="polite">
        {step.name === "welcome" ? (
          <div className="py-6 text-center">
            <h1 className="text-3xl leading-tight sm:text-5xl">{copy.welcomeTo(property.name)}</h1>
            <p className="mt-4 text-xl text-muted-foreground sm:text-2xl">{copy.letsCheckIn}</p>
            <Button
              size="touch-xl"
              className="mt-10 w-full max-w-md text-xl"
              onClick={() => setStep(property.listFlow ? { name: "platform" } : { name: "letter" })}
            >
              {copy.startCta}
            </Button>
            <p className="mt-6 text-muted-foreground">{copy.reassurance}</p>
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
                  onClick={() => {
                    setLetter(l);
                    setStep({ name: "checkout" });
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
                  onClick={() => {
                    setCheckOut(d);
                    setStep({ name: "platform" });
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
              {PLATFORMS.map((p) => (
                <Button
                  key={p}
                  variant="outline"
                  size="touch-xl"
                  className="text-xl"
                  disabled={busy}
                  onClick={() => void onPlatform(p)}
                >
                  {copy.platforms[p]}
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
                    <span>{i.label}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {copy.stepCheckout.replace("Which day do you check out?", "Check-out")} {formatUkDate(i.checkOut)}
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

        {step.name === "confirm" ? (
          <section className="py-4 text-center">
            <h1 className="text-4xl sm:text-6xl">{copy.hi(step.firstName)}</h1>
            <p className="mt-4 text-xl text-muted-foreground">{copy.confirmBody}</p>
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
                <p className="mt-4 text-lg">{copy.idConsent}</p>
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
                  onCapture={(url) => void onPhoto(url)}
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
              await finish();
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
                if (ok) await finish();
              }}
            >
              {busy ? <Loader2 className="size-6 animate-spin" /> : null}
              {copy.selfConfirm}
            </Button>
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
              <Link to="/stay/$token" params={{ token: step.stayToken }} target={kiosk ? "_self" : undefined}>
                <BookOpen className="size-6" /> {copy.stayGuideCta}
              </Link>
            </Button>
          </section>
        ) : null}

        {message ? (
          <p role="alert" className="mt-6 rounded-xl bg-accent/10 p-4 text-center text-lg text-foreground">
            {message}
          </p>
        ) : null}
      </main>
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
          inputMode={isEmail ? "email" : kind === "phone" ? "numeric" : "text"}
          autoComplete="off"
          maxLength={isEmail ? 254 : 4}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="touch-xl" className="w-full" disabled={busy || value.trim().length < 4}>
          {busy ? <Loader2 className="size-6 animate-spin" /> : null}
          {copy.last4Submit}
        </Button>
      </form>
      <Button variant="ghost" size="lg" className="mt-3 w-full" onClick={onOther}>
        {copy.idUseOther}
      </Button>
    </section>
  );
}
