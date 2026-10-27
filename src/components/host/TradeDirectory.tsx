import { useEffect, useState } from "react";
import { BadgeCheck, ExternalLink, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trades as copy } from "@/content/copy";
import { SERVICE_CATEGORIES } from "@/lib/services";
import { localSites, mapsSearch, tradeTerm } from "@/lib/trades";
import { region } from "@/lib/regions";

/**
 * Searches the local trade directories for the property's own area. The
 * directories have no API and forbid automated extraction, so every search
 * opens in a new tab rather than being copied into Latchkey.
 */
export function TradeDirectory({
  postcode,
  address,
  countryCode = "GB",
}: {
  postcode: string;
  address?: string | null;
  countryCode?: string;
}) {
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
  const ready = area.trim().length > 0;
  const mapsUrl = mapsSearch(effectiveTerm, area);
  const sites = localSites(countryCode);

  return (
    <div className="space-y-4">
      <div className="card-soft p-4">
        <p className="text-sm text-muted-foreground">{copy.intro}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="trade-cat">{copy.jobLabel}</Label>
            <Select value={category} onValueChange={pickCategory}>
              <SelectTrigger id="trade-cat" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trade-term">{copy.termLabel}</Label>
            <Input
              id="trade-term"
              className="h-11"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={tradeTerm(category)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trade-area">{copy.areaLabel}</Label>
            <Input
              id="trade-area"
              className="h-11"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="HP13 5AA"
            />
          </div>
        </div>
        {ready ? (
          <Button asChild className="mt-3 h-auto min-h-11 whitespace-normal py-2">
            <a href={mapsUrl} target="_blank" rel="noreferrer">
              <MapPin className="size-4 shrink-0" /> {copy.mapsSearch(effectiveTerm, area)}{" "}
              <ExternalLink className="size-4 shrink-0" />
            </a>
          </Button>
        ) : (
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
            {copy.needArea}
          </p>
        )}
      </div>

      <section className="card-soft p-4">
        <h3 className="font-medium">{copy.whoTitle(region(countryCode).country)}</h3>
        <p className="text-sm text-muted-foreground">{copy.whoBody}</p>
        <ul className="mt-3 divide-y divide-border">
          {sites.map((site) => (
            <li key={site.id}>
              <a
                href={site.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm hover:bg-muted"
              >
                <span className="w-40 shrink-0 font-medium sm:w-48">
                  {site.name}
                  {site.official ? (
                    <BadgeCheck
                      className="ml-1 inline size-4 text-primary"
                      aria-label={copy.official}
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground">{site.bestFor}</span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm text-muted-foreground">{copy.legalNote}</p>
    </div>
  );
}
