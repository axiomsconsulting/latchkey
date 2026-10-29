/**
 * "The welcome (or what shows at rest) changed": a realtime ping from the
 * host's screen to that property's kiosk, so it updates straight away. It
 * carries nothing private; the kiosk then asks Latchkey for the message.
 * Browser only.
 */
import { supabase } from "@/integrations/supabase/client";

export const kioskChannel = (shortCode: string) => `kiosk-welcome:${shortCode.toLowerCase()}`;

export async function pingKiosk(shortCode: string): Promise<void> {
  const channel = supabase.channel(kioskChannel(shortCode));
  try {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 3000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(t);
          resolve();
        }
      });
    });
    await channel.send({ type: "broadcast", event: "refresh", payload: {} });
  } catch {
    // The kiosk also checks every minute, so a missed ping only delays it.
  } finally {
    void supabase.removeChannel(channel);
  }
}

/**
 * On the kiosk: call back whenever the host pings. Returns the unsubscribe.
 * Several parts of the kiosk listen (the welcome, the screen at rest); they
 * share one channel per property, since a channel name can only be joined once.
 */
const listening = new Map<
  string,
  { channel: ReturnType<typeof supabase.channel>; fns: Set<() => void> }
>();

export function onKioskPing(shortCode: string, fn: () => void): () => void {
  const name = kioskChannel(shortCode);
  let entry = listening.get(name);
  if (!entry) {
    const fns = new Set<() => void>();
    const channel = supabase
      .channel(name)
      .on("broadcast", { event: "refresh" }, () => fns.forEach((f) => f()));
    channel.subscribe();
    entry = { channel, fns };
    listening.set(name, entry);
  }
  entry.fns.add(fn);
  return () => {
    const e = listening.get(name);
    if (!e) return;
    e.fns.delete(fn);
    if (e.fns.size === 0) {
      listening.delete(name);
      void supabase.removeChannel(e.channel);
    }
  };
}

/**
 * For a run of pings in a row (calibrating the screen from the dashboard):
 * joins the channel once and keeps it, so each ping goes at once. Call
 * close() when done.
 */
export function kioskPinger(shortCode: string): { send: () => void; close: () => void } {
  // Broadcasts go to the kiosk's own channel name, so it's joined under that name.
  const target = supabase.channel(kioskChannel(shortCode));
  let ready = false;
  const queued: Array<() => void> = [];
  target.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    ready = true;
    queued.splice(0).forEach((f) => f());
  });
  const fire = () =>
    void target.send({ type: "broadcast", event: "refresh", payload: {} }).catch(() => {});
  return {
    send: () => (ready ? fire() : queued.push(fire)),
    close: () => void supabase.removeChannel(target),
  };
}
