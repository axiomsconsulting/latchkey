/**
 * The one shared public demo: a host account every visitor signs in as, and
 * its guest tour at /kiosk/tour. Hosts' own sample data (is_demo, other codes) is
 * not this, and keeps every real-guest protection.
 */

import { INTEGRATION_KEYS, type IntegrationModes } from "./integration-modes";

export const DEMO_EMAIL = "demo@latchkey.omsestates.uk";
export const DEMO_CODE = "tour";

/** Every outside integration stays simulated on the shared account (tests/demo-account.test.ts). */
export const DEMO_INTEGRATION_MODES: IntegrationModes = Object.fromEntries(INTEGRATION_KEYS.map((k) => [k, "demo"])) as IntegrationModes;

export const DEMO_LOCKED = "Settings are locked in the shared demo. Start a free trial to change them.";

/** The public guest tour, where lockouts are off and answers are shown. */
export function isTour(p: { is_demo?: boolean | null; short_code?: string | null }): boolean {
  return p.is_demo === true && p.short_code === DEMO_CODE;
}

/** Server functions that write with the admin client call this first. */
export function assertNotSharedDemo(claims: { email?: unknown } | null | undefined) {
  if (claims?.email === DEMO_EMAIL) throw new Error(DEMO_LOCKED);
}
