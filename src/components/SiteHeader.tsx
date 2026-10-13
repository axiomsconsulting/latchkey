import { Link } from "@tanstack/react-router";

import { SiteMenu } from "@/components/SiteMenu";
import { brand } from "@/content/copy";

/** The public pages' header: the mark on the left, the menu and its shortcuts on the right. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6">
      <Link to="/" search={{ home: true }} className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary font-display text-lg text-primary-foreground">
          L
        </span>
        <span className="truncate font-display text-xl">{brand.name}</span>
      </Link>
      <SiteMenu />
    </header>
  );
}
