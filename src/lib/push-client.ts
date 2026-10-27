/**
 * Turning push alerts on and off for this device. The push itself carries
 * nothing; the service worker fetches the newest alert with the token we
 * hand it here. Browser only.
 */
import { fromB64url } from "./webpush";
import { isIosSafari, isStandalone, serviceWorker } from "./pwa";

export type PushState = "unsupported" | "needs-app" | "ios-install" | "blocked" | "off" | "on";

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window)) {
    return isIosSafari() && !isStandalone() ? "ios-install" : "unsupported";
  }
  const reg = await serviceWorker();
  if (!reg) return "needs-app";
  if (Notification.permission === "denied") return "blocked";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${os} · ${browser}`;
}

export async function turnOnPush(
  publicKey: string,
  save: (endpoint: string, device: string) => Promise<{ token: string }>,
): Promise<void> {
  const reg = await serviceWorker();
  if (!reg) throw new Error("needs-app");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("blocked");
  const ready = await navigator.serviceWorker.ready;
  const sub =
    (await ready.pushManager.getSubscription()) ??
    (await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: fromB64url(publicKey) as BufferSource,
    }));
  const { token } = await save(sub.endpoint, deviceName());
  ready.active?.postMessage({ type: "push-token", token });
}

export async function turnOffPush(remove: (endpoint: string) => Promise<unknown>): Promise<void> {
  const reg = await serviceWorker();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await remove(sub.endpoint);
  await sub.unsubscribe();
}
