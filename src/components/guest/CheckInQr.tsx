import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Check, ChevronDown, Copy, QrCode, Share2, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { guest as copy } from "@/content/copy";
import { cn } from "@/lib/utils";
import { qrPath } from "@/lib/qr";
import { headerIconClass } from "@/components/guest/KioskClocks";

/** A phone outline with a small QR square on its screen. */
export function PhoneQrIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5.5" y="2" width="13" height="20" rx="2.5" />
      <path d="M10.5 19h3" />
      <rect x="8" y="6" width="3" height="3" rx="0.4" />
      <rect x="13" y="6" width="3" height="3" rx="0.4" />
      <rect x="8" y="11" width="3" height="3" rx="0.4" />
      <path d="M13 11h1.2M15.6 11h.4M13 13h.4M14.6 12.4v1.6M16 13.2v.8" />
    </svg>
  );
}

/**
 * A QR code on a screen: see-through, its squares in the text colour around it
 * (currentColor), so it sits on the screen's own background. `backed` (pop-ups)
 * puts a translucent panel of the page's background behind it, so it still scans
 * over whatever shows through.
 */
export function QrSquare({
  value,
  className,
  backed = false,
  label = copy.qrAlt,
}: {
  value: string | null;
  className?: string;
  backed?: boolean;
  label?: string;
}) {
  const path = useMemo(() => {
    if (!value) return null;
    try {
      return qrPath(QRCode.create(value, { errorCorrectionLevel: "M" }).modules);
    } catch {
      return null;
    }
  }, [value]);
  if (!path) return null;
  const svg = (
    <svg
      viewBox={`0 0 ${path.size} ${path.size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      data-qr
      className={cn("block aspect-square", backed ? "relative h-full w-full" : className)}
    >
      <path fill="currentColor" d={path.d} />
    </svg>
  );
  if (!backed) return svg;
  // A separate layer with opacity (not a /opacity colour), which older tablet browsers draw solid.
  return (
    <span data-qr-backed className={cn("relative block aspect-square p-[3%]", className)}>
      <span aria-hidden className="absolute inset-0 rounded-[inherit] bg-background opacity-85" />
      {svg}
    </span>
  );
}

/** Draws the QR once per URL as a PNG (screensaver looks with their own fixed colours). */
export function useQrImage(
  url: string | null,
  colours: { dark: string; light: string } = { dark: "#1f3d2b", light: "#fdfaf4" },
) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!url) {
      setSrc(null);
      return;
    }
    QRCode.toDataURL(url, { width: 640, margin: 1, color: colours })
      .then((d) => {
        if (live) setSrc(d);
      })
      .catch(() => {
        if (live) setSrc(null);
      });
    return () => {
      live = false;
    };
  }, [url, colours.dark, colours.light]);
  return src;
}

export function CheckInQr({
  url,
  heading,
  blurb,
  compact,
}: {
  url: string | null;
  heading: string;
  blurb: string;
  /** True on phones: show a small corner button instead of a whole card. */
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  if (compact) {
    return (
      <>
        <Button
          variant="outline"
          size="lg"
          onClick={() => setOpen(true)}
          aria-label={copy.qrOpen}
          className="fixed bottom-4 left-4 z-40 h-14 gap-2 rounded-full px-4 shadow-soft"
        >
          <PhoneQrIcon className="size-6" />
          <span className="text-sm">{copy.qrSwitch}</span>
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{heading}</DialogTitle>
            </DialogHeader>
            <QrSquare
              value={url}
              backed
              className="mx-auto w-full max-w-[18rem] rounded-2xl text-foreground"
            />
            <p className="text-center text-sm text-muted-foreground">{blurb}</p>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <aside className={cn("rounded-2xl border bg-card p-5 text-center shadow-soft")}>
      <Smartphone className="mx-auto mb-2 size-6 text-primary" aria-hidden />
      <h2 className="font-serif text-lg">{heading}</h2>
      <QrSquare value={url} className="mx-auto my-3 w-full max-w-[13rem]" />
      <p className="text-sm text-muted-foreground">{blurb}</p>
    </aside>
  );
}

/**
 * The end of check-in: the private link to this booking's guest guide, to
 * bookmark or save, so the guest never has to check in again to read it.
 * The QR opens inline for another phone; on the kiosk it starts open,
 * because the link itself is no use on a shared screen.
 */
export function GuideLink({
  url,
  shortText = null,
  kiosk = false,
  beside = false,
}: {
  url: string;
  /** The easy-to-remember link ("example.com/g/hill-otter-amber"), shown big on a door tablet. */
  shortText?: string | null;
  kiosk?: boolean;
  /** Beside the guide button on a door tablet on its side, filling its half. */ beside?: boolean;
}) {
  const [qrOpen, setQrOpen] = useState(kiosk);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const mac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is selectable on screen anyway.
    }
  }

  return (
    <div
      className={cn(
        "mx-auto rounded-2xl border border-border bg-card p-5 text-left",
        beside ? "w-full max-w-lg" : kiosk ? "mt-8 w-full max-w-xl" : "mt-8 max-w-md",
        kiosk && "sm:p-6",
      )}
    >
      {/* On the kiosk, the same sizes as the rest of the check-in (headings, body text). */}
      <h2 className={kiosk ? "text-2xl" : "text-xl"}>{copy.guideLinkTitle}</h2>
      {!kiosk ? (
        <>
          <p className="mt-1 text-muted-foreground">{copy.guideLinkBody}</p>
          <input
            readOnly
            value={url}
            aria-label={copy.guideLinkTitle}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-3 h-12 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground"
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" size="lg" onClick={() => void copyLink()}>
              {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
              {copied ? copy.guideLinkCopied : copy.guideLinkCopy}
            </Button>
            {canShare ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() =>
                  void navigator.share({ title: copy.guideLinkTitle, url }).catch(() => {})
                }
              >
                <Share2 className="size-5" /> {copy.guideLinkShare}
              </Button>
            ) : null}
          </div>
          {!touch ? (
            <p className="mt-2 text-sm text-muted-foreground">{copy.guideLinkBookmarkKeys(mac)}</p>
          ) : null}
        </>
      ) : null}

      {/* On the kiosk the square is the only way to take the link away, so it simply shows. */}
      {!kiosk ? (
        <button
          type="button"
          aria-expanded={qrOpen}
          onClick={() => setQrOpen((o) => !o)}
          className={cn(
            "mt-4 flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-left font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            kiosk && "min-h-14 text-lg",
          )}
        >
          <span className="flex items-center gap-2">
            <QrCode className="size-5" /> {qrOpen ? copy.guideLinkQrHide : copy.guideLinkQrShow}
          </span>
          <ChevronDown className={cn("size-5 transition-transform", qrOpen && "rotate-180")} />
        </button>
      ) : null}
      {qrOpen ? (
        <div className="mt-2 text-center animate-in fade-in slide-in-from-top-1">
          {/* On the kiosk the square is as big as the screen allows, never squeezed by the text. */}
          <QrSquare
            value={url}
            className={cn(
              "mx-auto w-full",
              kiosk ? "max-w-[min(20rem,calc(var(--kiosk-h,100dvh)-27rem))]" : "max-w-[15rem]",
            )}
          />
          {kiosk && shortText ? (
            <p className="mt-3 break-all font-mono text-xl font-semibold tracking-wide sm:text-2xl">
              {shortText}
            </p>
          ) : null}
          <p className={cn("mt-2 text-muted-foreground", kiosk ? "text-lg" : "text-sm")}>
            {copy.guideLinkQrBody}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The front-door tablet's "use your phone instead" square. Large beside the
 * welcome; once a guest starts here, a small button in the bottom-right
 * corner that opens it again. When a stay has been found, the square
 * carries that check-in over to the phone.
 */
export function KioskQr({
  url,
  large,
  carryOn,
  others = false,
}: {
  url: string;
  large: boolean;
  carryOn: boolean;
  /** Other guests are being filled in: the square lets them use their own phones. */
  others?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (large) setOpen(false);
    setTarget(document.getElementById("kiosk-header-action"));
  }, [large]);
  if (!url) return null;
  if (large) {
    return (
      <aside className="rounded-3xl border bg-card p-4 text-center shadow-soft sm:p-6">
        <Smartphone
          className="mx-auto mb-2 size-7 text-primary [@media(max-height:560px)]:hidden"
          aria-hidden
        />
        <h2 className="font-display text-xl sm:text-2xl">{copy.kioskQrTitle}</h2>
        {/* Sized by the screen's height too, so it fits a small tablet on its side. */}
        <QrSquare
          value={url}
          className="mx-auto my-3 w-full max-h-[calc(var(--kiosk-h,100vh)*0.42)] max-w-[15rem]"
        />
        <p className="text-sm text-muted-foreground sm:text-base">{copy.kioskQrBody}</p>
      </aside>
    );
  }
  // A phone with a square on its screen: "scan this with your phone".
  const button = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={others ? copy.othersHeading : carryOn ? copy.qrOpen : copy.kioskQrTitle}
      title={others ? copy.othersHeading : carryOn ? copy.qrOpen : copy.kioskQrTitle}
      className={cn(
        headerIconClass,
        others && "text-primary hover:text-primary",
        !target && "fixed bottom-5 right-5 z-40",
      )}
    >
      <PhoneQrIcon className="size-[2.5em]" />
    </button>
  );
  return (
    <>
      {/* Beside the time and date at the top of the kiosk, where the day icon sits on the welcome. */}
      {target ? createPortal(button, target) : button}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* kiosk-qr-dialog / kiosk-close: a larger square and close button on expanded door tablets (styles.css). */}
        <DialogContent className="kiosk-qr-dialog max-w-sm" closeClassName="kiosk-close">
          <DialogHeader>
            <DialogTitle className="font-display font-bold" data-kiosk-qr-title>
              {others ? copy.othersHeading : carryOn ? copy.qrHeading : copy.kioskQrTitle}
            </DialogTitle>
          </DialogHeader>
          {/* Just the heading and the square: the heading already says what to do. */}
          <QrSquare
            value={url}
            backed
            className="mx-auto w-full max-w-[18rem] rounded-2xl text-foreground"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Jumbo's first screen: the phone square in the card itself, with a couple of words, never an icon. */
export function CardQr({ url, label }: { url: string; label: string }) {
  return (
    <div
      data-jumbo-cardqr
      className="flex min-h-0 flex-col items-center justify-center gap-[2cqmin]"
    >
      <p className="text-center font-bold">{label}</p>
      <QrSquare value={url} className="w-full" />
    </div>
  );
}
