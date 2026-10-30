import { RefreshCw } from "lucide-react";

import { updateCopy as copy } from "@/content/copy";
import { reloadToUpdate } from "@/hooks/use-app-update";
import { cn } from "@/lib/utils";

/** "v0.90.0", with a small Update button beside it when a newer version is published. */
export function AppVersion({
  current,
  available,
  latest,
  label,
  className,
}: {
  current: string;
  available: boolean;
  latest: string | null;
  label?: (v: string) => string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {label ? label(current) : `v${current}`}
      {available ? (
        <button
          type="button"
          onClick={() => void reloadToUpdate()}
          title={copy.updateTo(latest ?? "")}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground"
        >
          <RefreshCw className="size-3" aria-hidden /> {copy.update}
        </button>
      ) : null}
    </span>
  );
}
