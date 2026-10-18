import { getSiteContext, type SiteContext } from "./site.functions";

// The browser reads the site once (brand, and a host's own domain); the server works it out per request.
let siteOnce: Promise<SiteContext> | null = null;
export function loadSite(): Promise<SiteContext> {
  if (typeof window === "undefined") return getSiteContext();
  siteOnce ??= getSiteContext().catch((e) => {
    siteOnce = null;
    throw e;
  });
  return siteOnce;
}
/** After the super admin changes the brand: read it again. */
export function forgetSite() {
  siteOnce = null;
}

