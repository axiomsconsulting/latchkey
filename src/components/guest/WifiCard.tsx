import { useEffect, useState } from "react";
import { QrSquare } from "@/components/guest/CheckInQr";
import { Copy, KeyRound, Lock, Wifi } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { wifiCopy as copy } from "@/content/copy";
import { inAppBrowser, joinKind, wifiQrText, type JoinKind } from "@/lib/stay-access";

/**
 * The guest page's one Wi-Fi card, in two columns: the network, password and the way to join
 * on the left, the Wi-Fi code on the right (for anyone else's phone or laptop: the camera offers
 * Join in one tap). A web page can't join a network itself on any phone, so on this device:
 * iPhone and iPad copy the password (Settings → Wi-Fi → paste), with the Apple profile as a
 * second way; Android copies it and opens the Wi-Fi panel. When the host keeps the password
 * until check-in, it says so and offers check-in instead.
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
          ) : kind === "ios" ? (
            <div className="space-y-1.5">
              {wifi.password ? (
                <Button size="lg" onClick={() => void copyPassword()}>
                  <Copy /> {copy.iosCopy}
                </Button>
              ) : null}
              <p className="text-sm text-muted-foreground">{copy.iosHelp(wifi.name)}</p>
              <a href={profileUrl} className="inline-block text-sm text-primary underline">
                {copy.iosProfile}
              </a>
              {inApp ? <p className="text-sm font-medium">{copy.inApp}</p> : null}
            </div>
          ) : kind === "android" ? (
            <div className="space-y-1.5">
              <Button size="lg" onClick={() => void android()}>
                <Wifi /> {copy.join}
              </Button>
              <p className="text-sm text-muted-foreground">
                {wifi.password ? copy.androidHelp : copy.androidOpenHelp}
              </p>
              {inApp ? <p className="text-sm font-medium">{copy.inApp}</p> : null}
            </div>
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
            {kind !== "other" ? (
              <figcaption className="max-w-[10rem] text-xs text-muted-foreground sm:max-w-[12rem]">
                {copy.qrHelp}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
      </div>
    </section>
  );
}
