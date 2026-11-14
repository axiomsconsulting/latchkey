import { useEffect, useState } from "react";
import { QrSquare } from "@/components/guest/CheckInQr";
import { Copy, KeyRound, Lock, Wifi } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { wifiCopy as copy } from "@/content/copy";
import { inAppBrowser, joinKind, wifiQrText, type JoinKind } from "@/lib/stay-access";

/**
 * The guest page's one Wi-Fi card, in two columns: the network, password and the way to join
 * on the left, the Wi-Fi code on the right (for anyone else's phone or laptop: the camera offers
 * Join in one tap). On a phone, Connect opens a short list of what will happen first (iPhone:
 * the Wi-Fi profile, Allow, Settings → Install; Android: the password is copied and the Wi-Fi
 * list opens), so nothing surprises the guest, then Connect Wi-Fi carries on. When the host keeps
 * the password until check-in, it says so and offers check-in instead.
 */
export function WifiCard({
  wifi,
  profileUrl,
  checkInHref,
  id,
}: {
  wifi: { name: string; password: string | null; locked: boolean };
  /** The Apple profile for this page (room code or stay link). */
  profileUrl: string;
  checkInHref: string;
  id?: string;
}) {
  const [kind, setKind] = useState<JoinKind>("other");
  const [inApp, setInApp] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setKind(joinKind(navigator.userAgent));
    setInApp(inAppBrowser(navigator.userAgent));
  }, []);
  const qr = wifi.locked ? null : wifiQrText(wifi.name, wifi.password);

  const copyPassword = async () => {
    if (!wifi.password) return;
    await navigator.clipboard.writeText(wifi.password).then(
      () => toast.success(copy.copied),
      () => undefined,
    );
  };
  const android = async () => {
    await copyPassword();
    // Android 10 and later open the Wi-Fi panel over the page (a web page can't join a network itself).
    window.location.href = "intent:#Intent;action=android.settings.panel.action.WIFI;end";
  };

  return (
    <section id={id} aria-labelledby="wifi-title" className="card-soft scroll-mt-6 p-5">
      <div
        className={
          qr ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:gap-6" : undefined
        }
      >
        <div className="min-w-0 space-y-3">
          <h2 id="wifi-title" className="flex items-center gap-2 text-xl">
            <Wifi className="size-6 text-primary" aria-hidden /> {copy.title}
          </h2>
          <dl className="space-y-1">
            <dt className="text-sm text-muted-foreground">{copy.network}</dt>
            <dd className="break-words text-lg font-medium">{wifi.name}</dd>
            {wifi.locked ? null : (
              <>
                <dt className="pt-1 text-sm text-muted-foreground">{copy.password}</dt>
                <dd className="flex items-center gap-2 text-lg">
                  <span className="break-all font-mono font-medium">
                    {wifi.password ?? copy.open}
                  </span>
                  {wifi.password ? (
                    <button
                      type="button"
                      onClick={() => void copyPassword()}
                      aria-label={copy.copy}
                      className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-secondary"
                    >
                      <Copy className="size-4" />
                    </button>
                  ) : null}
                </dd>
              </>
            )}
          </dl>
          {wifi.locked ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-muted p-3 sm:flex-row sm:items-center">
              <p className="flex min-w-0 flex-1 items-start gap-3">
                <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <span>{copy.locked}</span>
              </p>
              <Button asChild className="sm:shrink-0">
                <a href={checkInHref}>
                  <KeyRound /> {copy.checkIn}
                </a>
              </Button>
            </div>
          ) : kind !== "other" ? (
            <Button size="lg" onClick={() => setOpen(true)}>
              <Wifi /> {copy.connect}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{copy.qrHelpComputer}</p>
          )}
        </div>
        {qr ? (
          <figure className="space-y-1">
            <QrSquare
              value={qr}
              label={copy.qrAlt(wifi.name)}
              className="size-32 min-[400px]:size-40 sm:size-48"
            />
          </figure>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md space-y-3">
          <DialogTitle>{copy.connectTitle(wifi.name)}</DialogTitle>
          <ol className="list-decimal space-y-1.5 pl-5 text-base">
            {(kind === "ios"
              ? copy.iosSteps(wifi.name)
              : copy.androidSteps(wifi.name, !!wifi.password)
            ).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {kind === "ios" ? <p className="text-sm text-muted-foreground">{copy.iosSafe}</p> : null}
          {inApp ? <p className="text-sm font-medium">{copy.inApp}</p> : null}
          {kind === "ios" ? (
            <Button asChild size="lg" className="w-full">
              <a href={profileUrl} onClick={() => setOpen(false)}>
                <Wifi /> {copy.connectWifi}
              </a>
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setOpen(false);
                void android();
              }}
            >
              <Wifi /> {copy.connectWifi}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
