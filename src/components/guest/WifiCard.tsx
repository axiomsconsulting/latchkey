import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, KeyRound, Lock, Wifi } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { wifiCopy as copy } from "@/content/copy";
import { joinKind, wifiQrText, type JoinKind } from "@/lib/stay-access";

/**
 * The guest page's one Wi-Fi card. iPhone and iPad: Join installs the network
 * (an Apple profile; tap Install in Settings). Android: the password is
 * copied and the phone's Wi-Fi panel opens, to pick the network and paste.
 * Anywhere else: a code to scan with the phone's camera, which offers to
 * join. When the host keeps the password until check-in, it says so and
 * offers check-in instead.
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
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => setKind(joinKind(navigator.userAgent)), []);
  useEffect(() => {
    if (wifi.locked || kind !== "other") return;
    void QRCode.toDataURL(wifiQrText(wifi.name, wifi.password), { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [wifi, kind]);

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
    <section id={id} aria-labelledby="wifi-title" className="card-soft scroll-mt-6 space-y-3 p-5">
      <h2 id="wifi-title" className="flex items-center gap-2 text-xl">
        <Wifi className="size-6 text-primary" aria-hidden /> {copy.title}
      </h2>
      <dl className="grid gap-1 text-lg sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
        <dt className="text-muted-foreground">{copy.network}</dt>
        <dd className="break-words font-medium">{wifi.name}</dd>
        {wifi.locked ? null : (
          <>
            <dt className="text-muted-foreground">{copy.password}</dt>
            <dd className="flex items-center gap-2">
              <span className="break-all font-mono font-medium">{wifi.password ?? copy.open}</span>
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
        <div className="space-y-1">
          <Button asChild size="lg">
            <a href={profileUrl}>
              <Wifi /> {copy.join}
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">{copy.iosHelp}</p>
        </div>
      ) : kind === "android" ? (
        <div className="space-y-1">
          <Button size="lg" onClick={() => void android()}>
            <Wifi /> {copy.join}
          </Button>
          <p className="text-sm text-muted-foreground">
            {wifi.password ? copy.androidHelp : copy.androidOpenHelp}
          </p>
        </div>
      ) : qr ? (
        <div className="flex flex-wrap items-center gap-4">
          <img src={qr} alt={copy.qrAlt(wifi.name)} className="size-36 rounded-xl bg-white p-1" />
          <p className="max-w-xs text-sm text-muted-foreground">{copy.qrHelp}</p>
        </div>
      ) : null}
    </section>
  );
}
