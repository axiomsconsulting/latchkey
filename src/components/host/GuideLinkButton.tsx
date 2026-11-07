import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { common, guideCopy as copy } from "@/content/copy";
import { createGuideLink } from "@/lib/guide.functions";

/** Makes a fresh private guide link for a booking and copies it. */
export function GuideLinkButton({
  bookingId,
  className,
  size,
  label,
  tourName,
  iconClassName,
}: {
  bookingId: string;
  className?: string;
  size?: "sm";
  /** A shorter label where space is tight; the full wording stays as the tooltip. */
  label?: string;
  /** The guided tour's marker (data-tour). */
  tourName?: string;
  iconClassName?: string;
}) {
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
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={run}
      disabled={busy}
      className={className}
      title={label ? copy.guideLink : undefined}
      data-tour={tourName}
    >
      {busy ? (
        <Loader2 className={cn("size-4 animate-spin", iconClassName)} />
      ) : (
        <Link2 className={cn("size-4", iconClassName)} />
      )}
      <span className="truncate">{label ?? copy.guideLink}</span>
    </Button>
  );
}
