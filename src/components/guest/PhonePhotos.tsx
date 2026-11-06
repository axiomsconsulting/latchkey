/**
 * Photo steps on the door tablet (src/lib/photo-handoff.ts): the tablet's
 * own camera when it has one, with a square and "Text me the link" beside
 * it to take the photos on a phone instead; only the phone when the host
 * chose no tablet camera or the tablet has none. Once a phone has the link
 * open and is on the task, the tablet just says to carry on there.
 */
import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Smartphone,
} from "lucide-react";

import { PhoneQrIcon, useQrImage } from "@/components/guest/CheckInQr";
import { useKioskStage } from "@/hooks/use-kiosk-stage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guest as copy } from "@/content/copy";
import { useHasCamera } from "@/hooks/use-has-camera";
import type { PhotoHandoff } from "@/hooks/use-photo-handoff";
import { kioskHandoff, type PhotoKind } from "@/lib/photo-handoff";
import { cn } from "@/lib/utils";

/** The square and "Text me the link". */
function PhonePanel({
  phone,
  big,
  compact = false,
}: {
  phone: PhotoHandoff;
  big: boolean;
  /** Jumbo: just "Or use your phone" and the square, in a row. */
  compact?: boolean;
}) {
  const qr = useQrImage(phone.link?.phoneUrl ?? null, { dark: "#111111", light: "#ffffff" });
  const [via, setVia] = useState<"sms" | "whatsapp" | null>(null);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const can = phone.link?.send;
  async function send() {
    if (!via) return;
    setBusy(true);
    setNote(null);
    const r = await phone.send(number, via);
    setBusy(false);
    const status = r?.status;
    setNote(
      status === "sent"
        ? copy.phonePhotos.sent
        : status === "demo"
          ? copy.phonePhotos.demo
          : status === "bad_number"
            ? copy.phonePhotos.badNumber
            : copy.phonePhotos.failed,
    );
    if (status === "sent" || status === "demo") setVia(null);
  }
  if (compact)
    return (
      <div className="flex items-center justify-center gap-[3%]" data-phone-photos>
        <p className="flex items-center gap-2 font-bold" data-jumbo-phone>
          <PhoneQrIcon className="size-[1.2em] shrink-0" />
          {copy.jumboPhone}
          <ArrowRight className="size-[1em] shrink-0" aria-hidden />
        </p>
        <div className="grid shrink-0 place-items-center rounded-xl bg-white p-1.5" data-jumbo-qr>
          {qr ? (
            <img src={qr} alt={copy.jumboPhone} className="size-full" />
          ) : (
            <Loader2 className="size-8 animate-spin text-neutral-400" />
          )}
        </div>
      </div>
    );
  return (
    <div
      className={cn(
        "@container rounded-2xl border border-border bg-card p-4 text-card-foreground",
        big ? "sm:p-6" : "",
      )}
      data-phone-photos
    >
      {/* One glance: a phone, an arrow, the square. Stacked in a narrow column, side by side when wide. */}
      <div className="flex flex-col items-center gap-2 text-center @lg:flex-row @lg:justify-center @lg:gap-6 @lg:text-left">
        <div className="flex items-center gap-3">
          <PhoneQrIcon className="size-12 shrink-0 text-primary @lg:size-16" />
          <p className="font-display text-2xl leading-tight @lg:text-3xl">
            {copy.phonePhotos.scan}
          </p>
        </div>
        <ArrowDown className="size-7 shrink-0 text-primary @lg:hidden" aria-hidden />
        <ArrowRight className="hidden size-9 shrink-0 text-primary @lg:block" aria-hidden />
        <div
          className={cn(
            "grid shrink-0 place-items-center rounded-xl bg-white p-2",
            big ? "size-[min(24rem,48vmin)]" : "size-[min(17rem,calc(var(--kiosk-h,100dvh)*0.3))]",
          )}
        >
          {qr ? (
            <img src={qr} alt={copy.phonePhotos.scan} className="size-full" />
          ) : (
            <Loader2 className="size-8 animate-spin text-neutral-400" />
          )}
        </div>
      </div>
      {can && (can.sms || can.whatsapp) ? (
        via ? (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              aria-label={copy.phonePhotos.number}
              placeholder={copy.phonePhotos.number}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="h-14 text-lg"
            />
            <Button type="submit" size="touch" disabled={busy || number.trim().length < 8}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : null}
              {copy.phonePhotos.sendLink}
            </Button>
          </form>
        ) : (
          <div className={cn("mt-4 grid gap-2", big && "sm:grid-cols-2")}>
            {can.sms ? (
              <Button variant="outline" size="touch" onClick={() => setVia("sms")}>
                <MessageSquareText className="size-5" aria-hidden /> {copy.phonePhotos.textMe}
              </Button>
            ) : null}
            {can.whatsapp ? (
              <Button variant="outline" size="touch" onClick={() => setVia("whatsapp")}>
                <MessageCircle className="size-5" aria-hidden /> {copy.phonePhotos.whatsAppMe}
              </Button>
            ) : null}
          </div>
        )
      ) : null}
      {note ? (
        <p className="mt-3 text-center text-muted-foreground" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** Only a phone here: the screen still never scrolls. */
function PhoneOnlyStage() {
  useKioskStage(true, null);
  return null;
}

/** Waiting for the phone. */
function OnPhone({
  what,
  onScreen,
}: {
  what: string;
  /** The tablet's own camera instead (only when it has one). */
  onScreen: (() => void) | null;
}) {
  return (
    <div className="space-y-6 py-6 text-center" role="status" aria-live="polite">
      <Smartphone className="mx-auto size-16 text-primary" aria-hidden />
      <p className="font-display text-3xl">{copy.phonePhotos.onPhone}</p>
      <p className="text-lg text-muted-foreground">{what}</p>
      <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" aria-hidden />
      {onScreen ? (
        <Button variant="ghost" size="lg" onClick={onScreen}>
          {copy.phonePhotos.useScreen}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A photo step: on a guest's own device just the camera; on the door
 * tablet the camera (if any) with the phone panel, or only the phone.
 * `facePending`: the phone is taking this guest's selfie after their ID.
 */
export function PhotoChoice({
  kiosk,
  phone,
  facing,
  kind,
  task,
  facePending = false,
  screen = false,
  onUseScreen,
  camera,
  extra,
  compact = false,
}: {
  /** Jumbo door tablet: the phone option as one short line and the square. */
  compact?: boolean;
  kiosk: boolean;
  phone: PhotoHandoff;
  facing: "user" | "environment" | null;
  kind: "id" | "face";
  task: PhotoKind;
  facePending?: boolean;
  /** The guest picked this screen's camera: the phone stops and this step stays on the screen. */
  onUseScreen: () => void;
  /** They already did: just the camera. */
  screen?: boolean;
  /**
   * The tablet's (or the guest's) camera, given which way it faces, what to
   * do if it can't open, and the phone panel to put under its buttons.
   */
  camera: (o: {
    facing: "user" | "environment";
    onFail: () => void;
    panel: ReactNode;
  }) => ReactNode;
  /** Skip or another way, shown with the phone panel when there's no camera here. */
  extra?: ReactNode;
}) {
  const hasCamera = useHasCamera();
  const [failed, setFailed] = useState(false);
  // No phone link to be had: this screen's camera whatever the host chose, if it has one.
  const own = (facing !== null || phone.failed) && hasCamera && !failed;
  const facingNow = facing ?? (kind === "id" ? "environment" : "user");
  if (!kiosk)
    return <>{camera({ facing: facing ?? "user", onFail: () => setFailed(true), panel: null })}</>;
  if ((screen || phone.failed) && own)
    return <>{camera({ facing: facingNow, onFail: () => setFailed(true), panel: null })}</>;
  const state = kioskHandoff({
    connected: phone.connected,
    task: phone.task,
    result: phone.result,
  });
  if (facePending || state === "onPhone") {
    const what =
      facePending || task === "face"
        ? copy.phonePhotos.onPhoneFace
        : task === "find"
          ? copy.phonePhotos.onPhoneFind
          : copy.phonePhotos.onPhoneId;
    return (
      <OnPhone
        what={what}
        onScreen={
          own
            ? () => {
                onUseScreen();
                void phone.clear();
              }
            : null
        }
      />
    );
  }
  if (!own)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <PhoneOnlyStage />
        {hasCamera && facing !== null && !failed ? null : (
          <p className="text-center text-muted-foreground">{copy.phonePhotos.noCamera}</p>
        )}
        {phone.failed ? null : <PhonePanel phone={phone} big />}
        {extra}
      </div>
    );
  return (
    <>
      {camera({
        facing: facingNow,
        onFail: () => setFailed(true),
        panel: <PhonePanel phone={phone} big={false} compact={compact} />,
      })}
    </>
  );
}
