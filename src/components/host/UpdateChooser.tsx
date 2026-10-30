import { useState } from "react";
import { CalendarClock, Moon, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateCopy as copy } from "@/content/copy";
import type { UpdateMode } from "@/lib/app-update";

/**
 * How to update: now (reloads within a minute or two), when not in use
 * (once nobody has used it for 15 minutes), or at a set time (reloads then).
 */
export function UpdateChooser({
  busy,
  onChoose,
}: {
  busy: boolean;
  onChoose: (mode: UpdateMode, at: string | null) => void;
}) {
  const [at, setAt] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => onChoose("now", null)}>
          <RefreshCw className="size-4" /> {copy.now}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onChoose("idle", null)}>
          <Moon className="size-4" /> {copy.whenIdle}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="datetime-local"
          className="h-9 w-auto"
          aria-label={copy.at}
          value={at}
          onChange={(e) => setAt(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !at}
          onClick={() => onChoose("now", new Date(at).toISOString())}
        >
          <CalendarClock className="size-4" /> {copy.schedule}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{copy.modesHelp}</p>
    </div>
  );
}
