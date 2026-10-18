import { useEffect, useState } from "react";
import { Check, Download, Share, SquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pwaCopy as copy } from "@/content/copy";
import { installWay, onInstallChange, promptInstall, type InstallWay } from "@/lib/pwa";

/**
 * Install Latchkey (or the kiosk) as an app: the browser's own prompt where
 * there is one, step-by-step for iPhone and iPad, a pointer elsewhere.
 */
export function InstallApp({ kiosk = false, size = "default", className }: { kiosk?: boolean; size?: "default" | "sm"; className?: string }) {
  const [way, setWay] = useState<InstallWay | null>(null);
  useEffect(() => {
    const update = () => setWay(installWay());
    update();
    return onInstallChange(update);
  }, []);
  if (!way) return null;
  const label = kiosk ? copy.installKiosk : copy.installApp;

  if (way === "installed") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground ${className ?? ""}`}>
        <Check className="size-4 text-success" /> {copy.installed}
      </span>
    );
  }
  if (way === "prompt") {
    return (
      <Button size={size} variant="outline" className={className} onClick={() => void promptInstall()}>
        <Download className="size-4" /> {label}
      </Button>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size={size} variant="outline" className={className}>
          <Download className="size-4" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 rounded-2xl text-sm">
        {way === "ios" ? (
          <ol className="space-y-2">
            <li className="flex items-start gap-2">
              <Share className="mt-0.5 size-4 shrink-0 text-primary" /> {copy.iosStep1}
            </li>
            <li className="flex items-start gap-2">
              <SquarePlus className="mt-0.5 size-4 shrink-0 text-primary" /> {copy.iosStep2}
            </li>
            <li className="text-muted-foreground">{kiosk ? copy.iosKiosk : copy.iosStep3}</li>
          </ol>
        ) : (
          <div className="space-y-2">
            <p>{copy.menuInstall}</p>
            {kiosk ? <p className="text-muted-foreground">{copy.androidKiosk}</p> : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
