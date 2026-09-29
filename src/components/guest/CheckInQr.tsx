import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { guest as copy } from "@/content/copy";
import { cn } from "@/lib/utils";

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
          <QrCode className="size-5" />
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
