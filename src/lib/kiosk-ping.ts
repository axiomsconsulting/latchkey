/**
 * "The welcome changed": a realtime ping from the host's screen to that
 * property's kiosk, so it shows (or hides) the message straight away. It
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

/** On the kiosk: call back whenever the host pings. Returns the unsubscribe. */
export function onKioskPing(shortCode: string, fn: () => void): () => void {
  const channel = supabase.channel(kioskChannel(shortCode)).on("broadcast", { event: "refresh" }, () => fn());
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
