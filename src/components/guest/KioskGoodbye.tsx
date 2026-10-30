import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, DoorClosed, KeyRound, LogIn, Plane } from "lucide-react";

import { useQrImage } from "@/components/guest/CheckInQr";
import { useNow } from "@/components/guest/KioskClocks";
import { guest as copy } from "@/content/copy";
import { EXPRESS_CLOSE_MINUTES, pageNow } from "@/lib/checkout-goodbye";
import { kioskExpressCheckout, kioskGoodbyes, type GoodbyeCard } from "@/lib/goodbye.functions";
import { gridFor } from "@/lib/kiosk-devices";
import { onKioskPing } from "@/lib/kiosk-ping";

type Goodbyes = { cards: GoodbyeCard[]; keyDrop: string; lockDoor: boolean };

/** Today's goodbyes for the door tablet: read on start, every minute and when the host pings. */
export function useKioskGoodbyes(code: string, enabled: boolean) {
  const fn = useServerFn(kioskGoodbyes);
  const [data, setData] = useState<Goodbyes | null>(null);
  const load = useCallback(() => {
    void fn({ data: { code } })
      .then(setData)
      .catch(() => undefined);
  }, [code, fn]);
  useEffect(() => {
    if (!enabled) return;
    load();
    const id = window.setInterval(load, 60_000);
    const stop = onKioskPing(code, load);
    return () => {
      window.clearInterval(id);
      stop();
    };
  }, [code, enabled, load]);
  return { goodbyes: data, reload: load };
}

/**
 * The door tablet on check-out day: a card for each guest leaving now (a
 * personal goodbye, their room and check-out time, Express check-out), the
 * screen split between them; more than ten turn in pages every few seconds.
 * The key drop and the front door are said once, underneath. Arriving
 * guests can still start checking in.
 */
export function KioskGoodbyeScreen({
  code,
  goodbyes,
  onCheckIn,
  onArrive,
  onLeft,
}: {
  code: string;
  goodbyes: Goodbyes;
  onCheckIn: () => void;
  /** A guest's check-in card: start checking in (the photo ID finds their stay). */
  onArrive: () => void;
  onLeft: () => void;
}) {
  const now = useNow(1000);
  const express = useServerFn(kioskExpressCheckout);
  const [done, setDone] = useState<Awaited<ReturnType<typeof kioskExpressCheckout>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { items, page, pages } = pageNow(goodbyes.cards, now.getTime());
  const grid = gridFor(items.length);

  if (done)
    return (
      <ExpressReminder
        result={done}
        onClose={() => {
          setDone(null);
          onLeft();
        }}
      />
    );

  return (
    <div className="fixed inset-0 z-[94] flex select-none flex-col bg-primary p-[2vmin] text-primary-foreground">
      <header className="flex items-center justify-between gap-4 px-[1vmin] pb-[1.5vmin]">
        <h1 className="flex items-center gap-3 font-display text-[clamp(1.5rem,4vmin,3rem)]">
          <Plane className="size-[1em]" aria-hidden />{" "}
          {copy.cardsTitle(
            goodbyes.cards.filter((c) => c.kind === "in").length,
            goodbyes.cards.filter((c) => c.kind !== "in").length,
          )}
        </h1>
        {pages > 1 ? (
          <span className="text-[clamp(0.9rem,2vmin,1.25rem)] opacity-80">
            {copy.goodbyePage(page + 1, pages)}
          </span>
        ) : null}
      </header>
      <div
        className="grid min-h-0 flex-1 gap-[1.5vmin]"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
        }}
      >
        {items.map((c, i) => (
          <section
            key={c.handle || `in-${i}-${c.firstName}`}
            className="flex min-h-0 flex-col justify-between gap-[1vmin] overflow-hidden rounded-[2vmin] bg-primary-foreground p-[2.5vmin] text-primary"
          >
            <div className="min-h-0">
              <p
                className="font-display leading-tight"
                style={{ fontSize: `clamp(1.1rem, ${grid.cols > 2 ? 2.6 : 4}vmin, 3rem)` }}
              >
                {c.message}
              </p>
              <p className="mt-[1vmin] text-[clamp(0.85rem,1.8vmin,1.25rem)] opacity-80">
                {[c.room, c.kind === "in" ? copy.arrivalFrom(c.until) : copy.goodbyeBy(c.until)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {c.kind === "in" ? (
              <button
                type="button"
                onClick={onArrive}
                className="inline-flex min-h-12 w-fit items-center gap-2 rounded-full bg-primary px-[2.5vmin] py-[1vmin] text-[clamp(1rem,2.2vmin,1.5rem)] font-semibold text-primary-foreground"
              >
                <LogIn className="size-[1em]" aria-hidden /> {copy.arrivalCheckIn}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setBusy(c.handle);
                  void express({ data: { code, handle: c.handle } })
                    .then(setDone)
                    .catch(() => undefined)
                    .finally(() => setBusy(null));
                }}
                className="inline-flex min-h-12 w-fit items-center gap-2 rounded-full bg-primary px-[2.5vmin] py-[1vmin] text-[clamp(1rem,2.2vmin,1.5rem)] font-semibold text-primary-foreground"
              >
                {copy.goodbyeExpress} <ArrowRight className="size-[1em]" aria-hidden />
              </button>
            )}
          </section>
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[1vmin] pt-[1.5vmin] text-[clamp(0.95rem,2.2vmin,1.5rem)]">
        <div className="space-y-1">
          {goodbyes.keyDrop && goodbyes.cards.some((c) => c.kind !== "in") ? (
            <p className="flex items-start gap-2">
              <KeyRound className="mt-[0.2em] size-[1em] shrink-0" aria-hidden /> {goodbyes.keyDrop}
            </p>
          ) : null}
          {goodbyes.lockDoor && goodbyes.cards.some((c) => c.kind !== "in") ? (
            <p className="flex items-start gap-2">
              <DoorClosed className="mt-[0.2em] size-[1em] shrink-0" aria-hidden />{" "}
              {copy.expressDoor}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onCheckIn}
          className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-primary-foreground px-5 py-2 font-semibold"
        >
          <LogIn className="size-[1em]" aria-hidden /> {copy.goodbyeCheckIn}
        </button>
      </footer>
    </div>
  );
}

/** After Express check-out: the keys, the door and a review, then back to the usual screen after 10 minutes. */
function ExpressReminder({
  result,
  onClose,
}: {
  result: { firstName: string; keyDrop: string; lockDoor: boolean; reviewCode: string | null };
  onClose: () => void;
}) {
  const reviewUrl =
    result.reviewCode && typeof window !== "undefined"
      ? `${window.location.origin}/g/${result.reviewCode}`
      : null;
  const qr = useQrImage(reviewUrl);
  useEffect(() => {
    const id = window.setTimeout(onClose, EXPRESS_CLOSE_MINUTES * 60_000);
    return () => window.clearTimeout(id);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[94] flex select-none items-center justify-center bg-primary p-8 text-primary-foreground">
      <div className="grid w-full max-w-5xl items-center gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-6">
          <h1 className="font-display text-4xl leading-tight sm:text-6xl">
            {copy.expressTitle(result.firstName)}
          </h1>
          {result.keyDrop ? (
            <p className="flex items-start gap-3 text-2xl">
              <KeyRound className="mt-1 size-7 shrink-0" aria-hidden /> {result.keyDrop}
            </p>
          ) : null}
          {result.lockDoor ? (
            <p className="flex items-start gap-3 text-2xl">
              <DoorClosed className="mt-1 size-7 shrink-0" aria-hidden /> {copy.expressDoor}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-14 items-center rounded-full bg-primary-foreground px-10 text-xl font-semibold text-primary"
          >
            {copy.expressDone}
          </button>
          <p className="text-sm opacity-80">{copy.expressCloses}</p>
        </div>
        {qr ? (
          <figure className="mx-auto max-w-[16rem] rounded-2xl bg-white p-4 text-center text-black">
            <img src={qr} alt={copy.qrAlt} className="mx-auto w-full" />
            <figcaption className="mt-2 text-sm">{copy.expressReview}</figcaption>
          </figure>
        ) : null}
      </div>
    </div>
  );
}
