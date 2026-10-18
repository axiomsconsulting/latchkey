import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Check, ChevronDown, Copy, QrCode, Share2, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { guest as copy } from "@/content/copy";
import { cn } from "@/lib/utils";
import { headerIconClass } from "@/components/guest/KioskClocks";

/** A phone outline with a small QR square on its screen. */
export function PhoneQrIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5.5" y="2" width="13" height="20" rx="2.5" />
      <path d="M10.5 19h3" />
      <rect x="8" y="6" width="3" height="3" rx="0.4" />
      <rect x="13" y="6" width="3" height="3" rx="0.4" />
      <rect x="8" y="11" width="3" height="3" rx="0.4" />
      <path d="M13 11h1.2M15.6 11h.4M13 13h.4M14.6 12.4v1.6M16 13.2v.8" />
    </svg>
  );
}

/** Draws the QR once per URL; the image is small enough to keep in state. */
function useQrImage(url: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!url) {
      setSrc(null);
      return;
    }
    QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: "#1f3d2b", light: "#fdfaf4" } })
      .then((d) => {
        if (live) setSrc(d);
      })
      .catch(() => {
        if (live) setSrc(null);
      });
    return () => {
      live = false;
    };
  }, [url]);
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
  const src = useQrImage(url);
  const [open, setOpen] = useState(false);
  if (!src) return null;

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
            <img src={src} alt={copy.qrAlt} className="mx-auto w-full max-w-[18rem] rounded-2xl" />
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
      <img src={src} alt={copy.qrAlt} className="mx-auto my-3 w-full max-w-[13rem] rounded-xl" />
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
export function GuideLink({ url, kiosk = false }: { url: string; kiosk?: boolean }) {
  const [qrOpen, setQrOpen] = useState(kiosk);
  const [copied, setCopied] = useState(false);
  const src = useQrImage(qrOpen ? url : null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
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
    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-border bg-card p-5 text-left">
      <h2 className="text-xl">{copy.guideLinkTitle}</h2>
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
              <Button variant="outline" size="lg" onClick={() => void navigator.share({ title: copy.guideLinkTitle, url }).catch(() => {})}>
                <Share2 className="size-5" /> {copy.guideLinkShare}
              </Button>
            ) : null}
          </div>
          {!touch ? <p className="mt-2 text-sm text-muted-foreground">{copy.guideLinkBookmarkKeys(mac)}</p> : null}
        </>
      ) : null}

      <button
        type="button"
        aria-expanded={qrOpen}
        onClick={() => setQrOpen((o) => !o)}
        className="mt-4 flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-left font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <QrCode className="size-5" /> {qrOpen ? copy.guideLinkQrHide : copy.guideLinkQrShow}
        </span>
        <ChevronDown className={cn("size-5 transition-transform", qrOpen && "rotate-180")} />
      </button>
      {qrOpen ? (
        <div className="mt-2 text-center animate-in fade-in slide-in-from-top-1">
          {src ? <img src={src} alt={copy.qrAlt} className="mx-auto w-full max-w-[15rem] rounded-xl" /> : <div className="mx-auto aspect-square w-full max-w-[15rem] rounded-xl bg-muted" />}
          <p className="mt-2 text-sm text-muted-foreground">{copy.guideLinkQrBody}</p>
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
  const src = useQrImage(url);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (large) setOpen(false);
    setTarget(document.getElementById("kiosk-header-action"));
  }, [large]);
  if (!src) return null;
  if (large) {
    return (
      <aside className="rounded-3xl border bg-card p-4 text-center shadow-soft sm:p-6">
        <Smartphone className="mx-auto mb-2 size-7 text-primary [@media(max-height:560px)]:hidden" aria-hidden />
        <h2 className="font-display text-xl sm:text-2xl">{copy.kioskQrTitle}</h2>
        {/* Sized by the screen's height too, so it fits a small tablet on its side. */}
        <img src={src} alt={copy.qrAlt} className="mx-auto my-3 aspect-square w-full max-h-[42vh] max-w-[15rem] rounded-2xl object-contain" />
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
      className={cn(headerIconClass, others && "text-primary hover:text-primary", !target && "fixed bottom-5 right-5 z-40")}
    >
      <PhoneQrIcon className="size-[2.5em]" />
    </button>
  );
  return (
    <>
      {/* Beside the time and date at the top of the kiosk, where the day icon sits on the welcome. */}
      {target ? createPortal(button, target) : button}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{others ? copy.othersHeading : carryOn ? copy.qrHeading : copy.kioskQrTitle}</DialogTitle>
          </DialogHeader>
          <img src={src} alt={copy.qrAlt} className="mx-auto w-full max-w-[18rem] rounded-2xl" />
          <p className="text-center text-sm text-muted-foreground">{others ? copy.othersBlurb : carryOn ? copy.qrBlurb : copy.kioskQrBody}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
