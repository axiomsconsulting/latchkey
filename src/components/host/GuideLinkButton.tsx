import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { common, guideCopy as copy } from "@/content/copy";
import { createGuideLink } from "@/lib/guide.functions";

/** Makes a fresh private guide link for a booking and copies it. */
export function GuideLinkButton({ bookingId, className }: { bookingId: string; className?: string }) {
  const make = useServerFn(createGuideLink);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await make({ data: { bookingId } });
      const url = `${window.location.origin}/stay/${r.token}`;
      await navigator.clipboard.writeText(url).catch(() => window.prompt("Copy this link", url));
      toast.success(copy.guideLinkCopied);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={run} disabled={busy} className={className}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
      {copy.guideLink}
    </Button>
  );
}
