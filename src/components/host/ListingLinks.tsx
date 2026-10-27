import { ExternalLink, Globe } from "lucide-react";

import { ChannelIcon } from "@/components/ChannelIcon";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listingLinksCopy as copy } from "@/content/copy";
import { useBookingSites } from "@/hooks/use-host-data";
import { normaliseListingLinks, type ListingLink } from "@/lib/listing-links";

/** The sites' icons, each opening that listing on the site in a new tab. */
export function ListingLinkIcons({ links, className }: { links: unknown; className?: string }) {
  const sites = useBookingSites();
  const list = normaliseListingLinks(links);
  if (!list.length) return null;
  return (
    <span className={className ?? "inline-flex flex-wrap items-center gap-1"}>
      {list.map((l: ListingLink) => {
        const site = sites.find((s) => s.key === l.site);
        const label = site?.label ?? copy.otherSite;
        return (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            title={copy.open(label)}
            aria-label={copy.open(label)}
            className="grid size-8 place-items-center rounded-lg hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {l.site === "other" ? (
              <Globe className="size-4 text-muted-foreground" />
            ) : (
              <ChannelIcon
                channel={l.site}
                iconUrl={site?.iconUrl ?? null}
                label={label}
                size="1.1rem"
              />
            )}
          </a>
        );
      })}
    </span>
  );
}

/** Editing the links: one per line (or pasted all at once), with the site each is recognised as. */
export function ListingLinksField({
  id,
  value,
  onChange,
  hint,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  const found = normaliseListingLinks(value);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{copy.label}</Label>
      <Textarea
        id={id}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={copy.placeholder}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
      {found.length ? (
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <ExternalLink className="size-3.5" /> <ListingLinkIcons links={found} />
        </p>
      ) : null}
    </div>
  );
}

/** The stored links as text for the field. */
export const linksText = (links: unknown) =>
  normaliseListingLinks(links)
    .map((l) => l.url)
    .join("\n");
