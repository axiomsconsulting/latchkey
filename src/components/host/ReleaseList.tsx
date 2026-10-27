import { CheckCircle2, Sparkles, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { whatsNewCopy as copy } from "@/content/copy";
import type { ChangeKind, HostRelease } from "@/content/changelog";
import { formatUkDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ChangeKind, typeof Sparkles> = {
  new: Sparkles,
  improved: CheckCircle2,
  fixed: Wrench,
};
const LEVEL_TONE: Record<HostRelease["level"], string> = {
  major: "bg-primary text-primary-foreground",
  minor: "bg-accent/15 text-accent",
  fix: "bg-muted text-muted-foreground",
};

/** Releases as a friendly list: what's new, better and fixed, newest first. */
export function ReleaseList({
  releases,
  compact = false,
}: {
  releases: HostRelease[];
  compact?: boolean;
}) {
  return (
    <ol className={cn("space-y-6", compact && "space-y-4")}>
      {releases.map((r) => (
        <li key={r.version} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("font-display", compact ? "text-lg" : "text-xl")}>{r.title}</h3>
            <Badge className={cn("border-0", LEVEL_TONE[r.level])}>{copy.levels[r.level]}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {copy.versionLine(r.version, formatUkDate(r.date, { withYear: true }))}
          </p>
          <ul className="space-y-1.5">
            {r.items.map((it, i) => {
              const Icon = KIND_ICON[it.kind];
              return (
                <li key={i} className="flex gap-2 text-sm">
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-label={copy.kinds[it.kind]}
                  />
                  <span>{it.text}</span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
