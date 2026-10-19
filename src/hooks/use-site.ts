import { useRouteContext } from "@tanstack/react-router";

import type { SiteContext } from "@/lib/site.functions";
import { normaliseUi, type UiConfig } from "@/lib/ui-config";

const FALLBACK = normaliseUi(null);

/** The site this page is on (brand, a host's own domain, the super admin's menu and layouts), from the root route. */
export function useSite(): SiteContext | null {
  const ctx = useRouteContext({ strict: false }) as { site?: SiteContext | null };
  return ctx.site ?? null;
}

/** The super admin's menu and page layouts, for every host. */
export function useUi(): UiConfig {
  return useSite()?.ui ?? FALLBACK;
}
