import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ReleaseList } from "@/components/host/ReleaseList";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LATEST_VERSION, releasesFor, unseen, type HostRelease } from "@/content/changelog";
import { whatsNewCopy as copy } from "@/content/copy";
import { getSeenRelease, markReleaseSeen } from "@/lib/whatsnew.functions";

const LOCAL = "latchkey.seenRelease";

/**
 * Once per update, in the host app only (never on kiosks or guest pages):
 * what changed since this person last looked. New accounts start up to
 * date, so they're not shown the whole history.
 */
export function WhatsNewPopup({ admin, skip }: { admin: boolean; skip: boolean }) {
  const getSeen = useServerFn(getSeenRelease);
  const markSeen = useServerFn(markReleaseSeen);
  const [news, setNews] = useState<HostRelease[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (skip) return;
    let live = true;
    void (async () => {
      const server = await getSeen().catch(() => ({ available: false as const, seen: null }));
      let local: string | null = null;
      try {
        local = window.localStorage.getItem(LOCAL);
      } catch {
        local = null;
      }
      const seen = server.available ? (server.seen ?? local) : local;
      if (!seen) {
        // First time here: nothing to catch up on.
        remember();
        return;
      }
      const fresh = unseen(seen, releasesFor({ admin }));
      if (live && fresh.length) {
        setNews(fresh.slice(0, 3));
        setOpen(true);
      } else if (fresh.length === 0 && seen !== LATEST_VERSION) {
        // Only admin-only changes since: nothing to show, but move on.
        remember();
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, admin]);

  function remember() {
    try {
      window.localStorage.setItem(LOCAL, LATEST_VERSION);
    } catch {
      // Not remembered on this device; the account still is.
    }
    void markSeen({ data: { version: LATEST_VERSION } }).catch(() => undefined);
  }

  function close() {
    setOpen(false);
    remember();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{copy.popupTitle}</DialogTitle>
          <DialogDescription>{copy.popupBody}</DialogDescription>
        </DialogHeader>
        <ReleaseList releases={news} compact />
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={close}>{copy.gotIt}</Button>
          <Button asChild variant="outline" onClick={close}>
            <Link to="/app/whats-new">{copy.seeAll}</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
