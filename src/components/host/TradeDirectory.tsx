import { useEffect, useState } from "react";
import { ExternalLink, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trades as copy } from "@/content/copy";
import { SERVICE_CATEGORIES } from "@/lib/services";
import { directoryLinks, tradeTerm } from "@/lib/trades";

/**
 * Searches real UK trade directories for the property's own address. The
 * directories have no API and forbid automated extraction, so every search
 * opens in a new tab rather than being copied into Latchkey.
 */
export function TradeDirectory({ postcode, address }: { postcode: string; address?: string | null }) {
  const [category, setCategory] = useState<string>(SERVICE_CATEGORIES[0]?.id ?? "cleaning");
  const propertyArea = [postcode, address].find((v) => v && v.trim()) ?? "";
  const [area, setArea] = useState(propertyArea);
  const [term, setTerm] = useState(tradeTerm(SERVICE_CATEGORIES[0]?.id ?? "cleaning"));

  // Follow the property the host is looking at.
  useEffect(() => setArea(propertyArea), [propertyArea]);

  function pickCategory(id: string) {
    setCategory(id);
    setTerm(tradeTerm(id));
  }

  const effectiveTerm = term.trim() || tradeTerm(category);
  const links = directoryLinks(category, area).map((d) => ({
    ...d,
    url: d.search(effectiveTerm, area.trim() || "UK"),
  }));
  const ready = area.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="card-soft p-4">
        <p className="text-sm text-muted-foreground">{copy.intro}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="trade-cat">{copy.jobLabel}</Label>
            <Select value={category} onValueChange={pickCategory}>
              <SelectTrigger id="trade-cat" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trade-term">{copy.termLabel}</Label>
            <Input id="trade-term" className="h-11" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={tradeTerm(category)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trade-area">{copy.areaLabel}</Label>
            <Input id="trade-area" className="h-11" value={area} onChange={(e) => setArea(e.target.value)} placeholder="HP13 5AA" />
          </div>
        </div>
        {ready ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm">
              <Search className="size-4 text-primary" /> {copy.searching(effectiveTerm, area)}
            </p>
            <Button asChild size="sm">
              <a href={links[0]!.url} target="_blank" rel="noreferrer">
                {copy.searchNow(links[0]!.name)} <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{copy.needArea}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((d) => (
          <article key={d.id} className="card-soft flex flex-col p-4">
            <p className="font-medium">{d.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{d.blurb}</p>
            <Badge variant="secondary" className="mt-2 w-fit">{d.note}</Badge>
            <Button asChild variant="outline" size="touch" className="mt-3" disabled={!ready}>
              <a href={d.url} target="_blank" rel="noreferrer">{copy.openOn(d.name)} <ExternalLink className="size-4" /></a>
            </Button>
          </article>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{copy.legalNote}</p>
    </div>
  );
}
