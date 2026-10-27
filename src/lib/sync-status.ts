import { rebrand } from "@/lib/brand";
/**
 * What a calendar link's state means to a host, in plain words. Pure, so
 * the wording and the "is it still syncing?" rule are tested.
 */

export type LinkState = "syncing" | "ok" | "warning" | "error" | "never";

/** A sync that started this long ago without finishing has died, not stalled. */
const SYNC_TIMEOUT_MS = 3 * 60_000;

export function linkState(
  link: { sync_status: string; sync_started_at?: string | null; last_error?: string | null },
  now: Date = new Date(),
): LinkState {
  if (link.sync_started_at && now.getTime() - Date.parse(link.sync_started_at) < SYNC_TIMEOUT_MS)
    return "syncing";
  if (link.sync_status === "ok" || link.sync_status === "warning" || link.sync_status === "error")
    return link.sync_status;
  return "never";
}

/** Turns the sync's error message into what probably happened and what to do. */
export function explainSyncError(message: string | null | undefined): string {
  const m = (message ?? "").toLowerCase();
  const status = /\((\d{3})\)/.exec(m)?.[1];
  if (status === "404" || status === "410")
    return "The platform no longer recognises this link. It was probably reset or the listing was removed. Copy a fresh calendar link from the platform and paste it in with Edit.";
  if (status === "401" || status === "403")
    return "The platform refused the request. The link may have been made private or reset. Copy a fresh calendar link from the platform and paste it in with Edit.";
  if (status === "429")
    return rebrand("The platform asked us to slow down. Latchkey will try again on the next sync.");
  if (status && status.startsWith("5"))
    return rebrand(
      "The platform's calendar service had a problem at its end. Latchkey will try again on the next sync.",
    );
  if (m.includes("did not respond in time") || m.includes("could not reach"))
    return "The platform didn't answer. This is usually temporary; try Sync now in a few minutes.";
  if (m.includes("did not return a calendar"))
    return "That link opens a web page, not a calendar file. On the platform, look for 'Export calendar' or 'iCal' and copy that link instead.";
  if (m.includes("too large"))
    return "That calendar file is unusually large. Check it's the calendar for this one listing.";
  if (m.includes("redirects too many times"))
    return "The link keeps forwarding somewhere else. Copy the calendar link again from the platform.";
  if (
    m.includes("https://") ||
    m.includes("web address") ||
    m.includes("not reachable from the internet")
  )
    return rebrand(
      "That isn't a calendar link Latchkey can use. Copy the 'Export calendar' (iCal) link from the platform.",
    );
  if (m.includes("no calendar link saved"))
    return "This connection has lost its link. Paste the calendar link again with Edit.";
  if (m.includes("double") || m.includes("overlap"))
    return "Two platforms show different guests in the same room on the same nights. Check both and cancel one.";
  return message?.trim()
    ? message.trim()
    : "Something went wrong reading this calendar. Try Sync now; if it keeps happening, copy a fresh link from the platform.";
}
