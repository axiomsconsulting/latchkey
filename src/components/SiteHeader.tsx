import { Link } from "@tanstack/react-router";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { SiteMenu } from "@/components/SiteMenu";

/** The public pages' header: the mark on the left, the menu and its shortcuts on the right. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6">
      <Link to="/" search={{ home: true }} className="min-w-0">
        <BrandLogo />
      </Link>
      <SiteMenu />
    </header>
  );
}
