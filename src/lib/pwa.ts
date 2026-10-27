/**
 * Installing Latchkey as an app (PWA): the browser's install prompt, iPhone
 * and iPad "Add to Home Screen", and whether we're already installed.
 * Browser only.
 */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  // The browser offers this once, early; keep it for when the host taps Install.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    changed();
  });
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Running from the home screen / as an installed app. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone or iPad Safari, where installing is "Share → Add to Home Screen". */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export type InstallWay = "installed" | "prompt" | "ios" | "menu";

/** How this browser installs the app right now. */
export function installWay(): InstallWay {
  if (isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIosSafari()) return "ios";
  return "menu";
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const choice = await e.userChoice;
  changed();
  return choice.outcome === "accepted";
}

/** The service worker, once it's running (null where it isn't, e.g. the editor preview). */
export async function serviceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}
