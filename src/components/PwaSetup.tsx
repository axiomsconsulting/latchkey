import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

import { pwaCopy as copy } from "@/content/copy";
import "@/lib/pwa";

/**
 * Starts the service worker (offline shell and push alerts) on the real
 * site, never inside the editor's preview frame, and shows a small banner
 * while the connection is down.
 */
export function PwaSetup() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const inFrame = window.self !== window.top;
    const local = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    if ("serviceWorker" in navigator && !inFrame && (import.meta.env.PROD || !local)) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-accent-foreground print:hidden"
    >
      <WifiOff className="size-4" /> {copy.offline}
    </div>
  );
}
