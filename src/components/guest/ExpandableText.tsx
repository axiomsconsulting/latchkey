import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { guideCopy as gcopy } from "@/content/copy";

/**
 * Shows the first line of a rule or note, with the rest a tap away. Long
 * house rules are unreadable as a wall of text on a phone at midnight.
 */
export function ExpandableText({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  const breakAt = trimmed.search(/\n|(?<=[.!?])\s/);
  const first = breakAt > 0 ? trimmed.slice(0, breakAt + 1).trim() : trimmed;
  const rest = breakAt > 0 ? trimmed.slice(breakAt + 1).trim() : "";

  if (!rest) return <p className={`whitespace-pre-line ${className}`}>{trimmed}</p>;

  return (
    <div className="space-y-2">
      <p className={`whitespace-pre-line ${className}`}>{first}</p>
      {open ? <p className={`whitespace-pre-line ${className}`}>{rest}</p> : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1 text-base font-medium text-primary underline-offset-4 hover:underline"
      >
        {open ? gcopy.showLess : gcopy.showMore}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
    </div>
  );
}
