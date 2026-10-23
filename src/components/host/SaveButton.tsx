import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { common, saveCopy as copy } from "@/content/copy";
import { cn } from "@/lib/utils";

/** Has anything changed since it was last saved? (Compares plain data.) */
export const changed = (now: unknown, saved: unknown) => JSON.stringify(now) !== JSON.stringify(saved);

/**
 * A settings card's Save, at its top right: greyed out until something
 * changes, with a small bubble above it while there are changes not saved
 * yet, so they're hard to miss. Use as the last item of the card's heading row.
 */
export function SaveButton({
  dirty,
  busy = false,
  onClick,
  label = common.save,
  type = "button",
  form,
  className,
}: {
  dirty: boolean;
  busy?: boolean;
  onClick?: () => void;
  label?: string;
  type?: "button" | "submit";
  /** For a submit button outside its form. */
  form?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)}>
      {dirty && !busy ? (
        <span
          role="status"
          className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 whitespace-nowrap rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-foreground shadow-soft after:absolute after:right-5 after:top-full after:border-4 after:border-transparent after:border-t-accent animate-in fade-in slide-in-from-bottom-1"
        >
          {copy.unsaved}
        </span>
      ) : null}
      <Button type={type} form={form} size="sm" onClick={onClick} disabled={!dirty || busy} aria-label={dirty ? `${label}: ${copy.unsaved}` : label}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {label}
      </Button>
    </div>
  );
}
