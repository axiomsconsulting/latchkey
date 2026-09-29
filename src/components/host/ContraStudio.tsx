import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trades as copy } from "@/content/copy";
import { CONTRA_CATEGORIES, contraLink } from "@/lib/trades";

/**
 * Contra, used for what it is actually good at: the creative and marketing
 * work that fills rooms. Never for housekeeping or maintenance.
 */
export function ContraStudio() {
  return (
    <div className="space-y-4">
      <div className="card-soft p-4">
        <h3 className="text-lg">{copy.growthTitle}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{copy.growthBody}</p>
        <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{copy.notMaintenance}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CONTRA_CATEGORIES.map((c) => (
          <article key={c.id} className="card-soft flex flex-col p-4">
            <p className="font-medium">{c.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.blurb}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.subcategories.map((s) => (
                <Button key={s.id} asChild variant="outline" size="sm" className="rounded-full">
                  <a href={contraLink(s.term)} target="_blank" rel="noreferrer">
                    {s.label} <ExternalLink className="size-3" />
                  </a>
                </Button>
              ))}
            </div>
          </article>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{copy.contraNote}</p>
    </div>
  );
}
