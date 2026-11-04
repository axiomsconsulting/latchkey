import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** The longer explanation behind an (i), so a section can keep to one self-explanatory line. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="inline-grid size-6 shrink-0 place-items-center rounded-full align-middle text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[90vw] text-sm">{children}</PopoverContent>
    </Popover>
  );
}
