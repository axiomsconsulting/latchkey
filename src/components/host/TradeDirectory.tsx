import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trades as copy } from "@/content/copy";
import { SERVICE_CATEGORIES } from "@/lib/services";
import { directoryLinks, tradeTerm } from "@/lib/trades";

export function TradeDirectory({ postcode }: { postcode: string }) {
  const [category, setCategory] = useState<string>(SERVICE_CATEGORIES[0]?.id ?? "cleaning");
  const [area, setArea] = useState(postcode || "High Wycombe");
  const links = directoryLinks(category, area);

  return (
    <div className="space-y-4">
      <div className="card-soft p-4">
        <p className="text-sm text-muted-foreground">{copy.intro}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="trade-cat">{copy.jobLabel}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="trade-cat" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trade-area">{copy.areaLabel}</Label>
            <Input id="trade-area" className="h-11" value={area} onChange={(e) => setArea(e.target.value)} placeholder="HP13 5AA" />
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <Search className="size-4 text-primary" /> {copy.searching(tradeTerm(category), area)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((d) => (
          <article key={d.id} className="card-soft flex flex-col p-4">
            <p className="font-medium">{d.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{d.blurb}</p>
            <Badge variant="secondary" className="mt-2 w-fit">{d.note}</Badge>
            <Button asChild variant="outline" size="touch" className="mt-3">
              <a href={d.url} target="_blank" rel="noreferrer">{copy.openOn(d.name)} <ExternalLink className="size-4" /></a>
            </Button>
          </article>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{copy.legalNote}</p>
    </div>
  );
}
