import type { Provider } from "./services";

/**
 * Contra is a marketplace for creative, tech and marketing freelancers. It has
 * no cleaners, plumbers, electricians or other property trades, so Latchkey no
 * longer ships sample providers for those categories: showing invented firms
 * to a host with a leak at 11pm is worse than showing nothing.
 *
 * Property work goes through `trades.ts` (real UK directories, searched by the
 * property's own postcode). Contra keeps its place for listing photography,
 * copywriting, branding and marketing — see CONTRA_CATEGORIES in `trades.ts`.
 */
export const DEMO_PROVIDERS: Provider[] = [];
