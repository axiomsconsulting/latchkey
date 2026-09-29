import { Delete } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guest as copy } from "@/content/copy";
import { cn } from "@/lib/utils";

/**
 * Big touch-only number pad for guests on phones and tablets.
 * Shows filled dots for entered digits and calls onComplete when full.
 */
export function PinPad({
  value,
  onChange,
  length,
  busy = false,
  onComplete,
}: {
  value: string;
  onChange: (next: string) => void;
  length: number;
  busy?: boolean;
  onComplete?: (value: string) => void;
}) {
  function press(digit: string) {
    if (busy || value.length >= length) return;
    const next = value + digit;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  }

  return (
    <div className="mx-auto w-full max-w-xs space-y-6">
      <div className="flex justify-center gap-3" aria-label={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-5 rounded-full border-2 border-primary transition-colors",
              i < value.length ? "bg-primary" : "bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button
            key={d}
            type="button"
            variant="outline"
            size="touch-xl"
            className="text-3xl font-semibold"
            disabled={busy}
            onClick={() => press(d)}
          >
            {d}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="touch-xl"
          className="text-lg"
          disabled={busy || value.length === 0}
          onClick={() => onChange("")}
        >
          {copy.clear}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="touch-xl"
          className="text-3xl font-semibold"
          disabled={busy}
          onClick={() => press("0")}
        >
          0
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="touch-xl"
          aria-label={copy.backspace}
          disabled={busy || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
        >
          <Delete className="size-8" />
        </Button>
      </div>
    </div>
  );
}
