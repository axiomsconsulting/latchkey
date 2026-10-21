/**
 * Signed-in owners and managers who open "/" go straight to their dashboard,
 * before the home page paints. The session lives in the browser, so the
 * server can't tell; instead the dashboard leaves a note on this device, and
 * a tiny script in the home page's head reads it and moves on at once.
 * ?home=1 (the logo, Home, Pricing) always shows the home page.
 */
export const DASHBOARD_NOTE = "latchkey.dashboard";
const DAYS_30 = 30 * 86_400_000;

/** Called by the dashboard: this device's user can use it (or no longer can). */
export function rememberDashboard(canUse: boolean) {
  try {
    if (canUse) window.localStorage.setItem(DASHBOARD_NOTE, String(Date.now() + DAYS_30));
    else window.localStorage.removeItem(DASHBOARD_NOTE);
  } catch {
    // Private mode: the home page checks the session itself instead.
  }
}

/** Inline, runs before the home page shows. Kept tiny and dependency-free. */
export const HOME_REDIRECT_SCRIPT = `(function(){try{if(/[?&]home=(1|true)/.test(location.search))return;var u=Number(localStorage.getItem(${JSON.stringify(DASHBOARD_NOTE)}));if(u&&u>Date.now()){document.documentElement.style.visibility="hidden";location.replace("/app/today"+(/[?&]utm_/.test(location.search)?location.search:""));}}catch(e){}})();`;
