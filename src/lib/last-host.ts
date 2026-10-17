/**
 * The business this device last worked in (its name and look), so the
 * sign-in page can greet a returning host with their own logo. Browser only.
 */
import { normaliseTheme, type ThemeConfig } from "./theme";

const KEY = "latchkey.lastHost";

export function rememberHost(name: string, theme: ThemeConfig) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ name, theme }));
  } catch {
    // Private browsing: they'll see the Latchkey logo instead.
  }
}

export function lastHost(): { name: string; theme: ThemeConfig } | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { name?: string; theme?: unknown } | null;
    if (!v?.name) return null;
    return { name: v.name, theme: normaliseTheme(v.theme) };
  } catch {
    return null;
  }
}
