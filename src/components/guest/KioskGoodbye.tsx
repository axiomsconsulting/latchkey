import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, DoorClosed, KeyRound, LogIn, Plane } from "lucide-react";

import { useQrImage } from "@/components/guest/CheckInQr";
import { useNow } from "@/components/guest/KioskClocks";
import { guest as copy } from "@/content/copy";
import {
  EXPRESS_CLOSE_MINUTES,
  PER_PAGE,
  cardEdge,
  cardInk,
  pageNow,
} from "@/lib/checkout-goodbye";
import { deviceToken } from "@/lib/kiosk-presence";
import { cn } from "@/lib/utils";
import {
  kioskCardsStamp,
  kioskExpressCheckout,
  kioskGoodbyes,
  type GoodbyeCard,
} from "@/lib/goodbye.functions";
import { gridFor } from "@/lib/kiosk-devices";
import { onKioskPing } from "@/lib/kiosk-ping";

type Goodbyes = {
  cards: GoodbyeCard[];
  keyDrop: string;
  lockDoor: boolean;
  /** The host's card colours (Settings → Kiosk). */
  colours?: { in: string; out: string };
  mergedWelcome?: number | null;
};

/**
 * Text as large as fits its box: tries sizes down from `max` until it no
 * longer spills (height or width), and again whenever the box changes size.
 */
function FitText({
  text,
  max,
  min = 14,
  className,
}: {
  text: string;
  max: number;
  min?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const b = box.current;
    const t = inner.current;
    if (!b || !t) return;
    const fit = () => {
      let lo = min;
      let hi = max;
      // Binary search on the font size; a dozen steps is to the pixel.
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        t.style.fontSize = `${mid}px`;
        if (t.scrollHeight <= b.clientHeight && t.scrollWidth <= b.clientWidth) lo = mid;
        else hi = mid;
      }
      t.style.fontSize = `${Math.floor(lo)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    return () => ro.disconnect();
  }, [text, max, min]);
  return (
    <div ref={box} className="min-h-0 flex-1 overflow-hidden">
      <p ref={inner} className={className}>
        {text}
      </p>
    </div>
  );
}

/**
 * One guest's card: the host's colour with readable ink and a strong
 * outline, the message as big as the card allows, the room and time, and a
 * large full-width button. Sizes follow the card (container units), so a
 * card filling half the screen reads from across the hall.
 */
function GuestCard({
  card,
  colour,
  busy,
  onPress,
}: {
  card: GoodbyeCard;
  colour: string;
  busy: boolean;
  onPress: () => void;
}) {
  const ink = cardInk(colour);
  const edge = cardEdge(colour);
  const big = (n: number) => `clamp(1rem, ${n}cqmin, ${n * 0.9}rem)`;
  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-[3cqmin]"
      style={{
        containerType: "size",
        background: colour,
        color: ink,
        border: `max(4px, 1.4cqmin) solid ${edge}`,
        padding: "max(12px, 4cqmin)",
        gap: "max(8px, 2.5cqmin)",
      }}
    >
      <FitText
        text={card.message}
        max={140}
        min={16}
        className="font-display font-bold leading-[1.08]"
      />
      <p className="shrink-0 font-semibold leading-tight" style={{ fontSize: big(6) }}>
        {[card.room, card.kind === "in" ? copy.arrivalFrom(card.until) : copy.goodbyeBy(card.until)]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onPress}
        className="flex w-full shrink-0 items-center justify-center gap-[0.4em] rounded-full font-bold shadow-lg disabled:opacity-60"
        style={{
          background: ink,
          color: colour,
          fontSize: big(8),
          minHeight: "max(56px, 16cqmin)",
          padding: "0.35em 0.8em",
        }}
      >
        {card.kind === "in" ? (
          <>
            <LogIn className="size-[1em]" aria-hidden /> {copy.arrivalCheckIn}
          </>
        ) : (
          <>
            {copy.goodbyeExpress} <ArrowRight className="size-[1em]" aria-hidden />
          </>
        )}
      </button>
    </section>
  );
}

/**
 * Today's cards for the door tablet: read on start, every minute, when the
 * host pings, and whenever the property's cards stamp moves (checked every
 * few seconds, so Show now and Take off land even if the live ping was missed).
 */
export function useKioskGoodbyes(code: string, enabled: boolean) {
  const fn = useServerFn(kioskGoodbyes);
  const stampFn = useServerFn(kioskCardsStamp);
  const [data, setData] = useState<Goodbyes | null>(null);
  const stamp = useRef<string | null | undefined>(undefined);
  const load = useCallback(() => {
    const device = deviceToken(code);
    void fn({ data: { code, ...(device ? { device } : {}) } })
      .then(setData)
      .catch(() => undefined);
  }, [code, fn]);
  useEffect(() => {
    if (!enabled) return;
    load();
    const id = window.setInterval(load, 60_000);
    const quick = window.setInterval(() => {
      if (document.hidden) return;
      void stampFn({ data: { code } })
        .then(({ at }) => {
          if (stamp.current !== undefined && at !== stamp.current) load();
          stamp.current = at;
        })
        .catch(() => undefined);
    }, STAMP_MS);
    const stop = onKioskPing(code, load);
    return () => {
      window.clearInterval(id);
      window.clearInterval(quick);
      stop();
    };
  }, [code, enabled, load, stampFn]);
  return { goodbyes: data, reload: load };
}

/** How often the tablet checks whether the host changed the cards. */
const STAMP_MS = 5_000;

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
  contained = false,
  page: fixedPage,
  bell,
}: {
  code: string;
  goodbyes: Goodbyes;
  onCheckIn: () => void;
  /** A guest's check-in card: start checking in (the photo ID finds their stay, or the host's welcome opens it). */
  onArrive: (card: GoodbyeCard) => void;
  onLeft: () => void;
  /** The host's preview: inside its frame instead of over the whole screen, on a set page. */
  contained?: boolean;
  page?: number;
  /** The tablet's bell (KioskCardBell), top right: more cards up, or some off. */
  bell?: React.ReactNode;
}) {
  const now = useNow(1000);
  const express = useServerFn(kioskExpressCheckout);
  const [done, setDone] = useState<Awaited<ReturnType<typeof kioskExpressCheckout>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const paged = pageNow(goodbyes.cards, now.getTime());
  const pages = paged.pages;
  const page = fixedPage === undefined ? paged.page : Math.min(fixedPage, pages - 1);
  const items =
    fixedPage === undefined
      ? paged.items
      : goodbyes.cards.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
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
    <div
      className={cn(
        "inset-0 flex select-none flex-col bg-primary p-[2cqmin] text-primary-foreground",
        contained ? "absolute" : "fixed z-[94]",
      )}
      // Sizes follow this screen (the tablet's, or the host's preview frame).
      style={{ containerType: "size" }}
    >
      <header className="flex items-center justify-between gap-4 px-[1cqmin] pb-[1.5cqmin]">
        <h1 className="flex items-center gap-3 font-display text-[clamp(1.75rem,5.5cqmin,4rem)] font-bold">
          <Plane className="size-[1em]" aria-hidden />{" "}
          {copy.cardsTitle(
            goodbyes.cards.filter((c) => c.kind === "in").length,
            goodbyes.cards.filter((c) => c.kind !== "in").length,
          )}
        </h1>
        <div className="flex items-center gap-3">
          {pages > 1 ? (
            <span className="text-[clamp(0.9rem,2cqmin,1.25rem)] opacity-80">
              {copy.goodbyePage(page + 1, pages)}
            </span>
          ) : null}
          {bell}
        </div>
      </header>
      <div
        className="grid min-h-0 flex-1 gap-[1.5cqmin]"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
        }}
      >
        {items.map((c, i) => (
          <GuestCard
            key={c.handle || `in-${i}-${c.firstName}`}
            card={c}
            colour={
              c.kind === "in"
                ? (goodbyes.colours?.in ?? "#F6E2A8")
                : (goodbyes.colours?.out ?? "#CFE3EC")
            }
            busy={c.kind === "out" && busy !== null}
            onPress={() => {
              if (c.kind === "in") return onArrive(c);
              setBusy(c.handle);
              void express({ data: { code, handle: c.handle } })
                .then(setDone)
                .catch(() => undefined)
                .finally(() => setBusy(null));
            }}
          />
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[1cqmin] pt-[1.5cqmin] text-[clamp(1.1rem,3cqmin,2.2rem)] font-semibold">
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
          className="inline-flex min-h-14 items-center gap-2 rounded-full border-[3px] border-primary-foreground px-6 py-2 font-bold"
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
