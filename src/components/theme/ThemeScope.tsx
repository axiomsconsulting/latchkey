import { useEffect, type CSSProperties, type ReactNode } from "react";

import { googleFontLinks, themeVars, type ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Loads the fonts a theme needs (Google preset fonts and any uploaded font). */
export function useThemeFonts(theme: ThemeConfig | null | undefined) {
  const links = theme ? googleFontLinks(theme) : [];
  const key = links.map((l) => l.family).join("|");
  const custom =
    theme?.customFontUrl && theme.customFontName
      ? { url: theme.customFontUrl, name: theme.customFontName }
      : null;

  useEffect(() => {
    for (const l of links) {
      const id = `lk-font-${l.family.replace(/ /g, "-")}`;
      if (document.getElementById(id)) continue;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = l.href;
      // A font without every weight: load it as it comes.
      link.onerror = () => {
        link.onerror = null;
        link.href = l.fallback;
      };
      document.head.appendChild(link);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!custom) return;
    const id = `lk-face-${custom.name}-${custom.url.length}`;
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@font-face{font-family:"${custom.name}";src:url("${custom.url}");font-display:swap;}`;
    document.head.appendChild(style);
  }, [custom?.name, custom?.url]);
}

/** Applies a property's theme to everything inside it. */
export function ThemeScope({
  theme,
  children,
  className,
  global = false,
  full = false,
}: {
  theme: ThemeConfig | null | undefined;
  children: ReactNode;
  className?: string;
  /** Also theme the page root so dialogs and menus (rendered outside) match. */
  global?: boolean;
  /** Guest pages: the whole look (headings, button shapes, cards, icons, background), not just colours and fonts. */
  full?: boolean;
}) {
  useThemeFonts(theme);
  const vars = theme ? themeVars(theme) : {};
  const style = vars as CSSProperties;
  const key = JSON.stringify(vars);

  // Also theme the page root so dialogs and menus (rendered outside) match.
  useEffect(() => {
    if (!global) return;
    const root = document.documentElement;
    const entries = Object.entries(JSON.parse(key) as Record<string, string>);
    for (const [k, v] of entries) root.style.setProperty(k, v);
    // Dialogs and menus open outside this area: give the page root the full look too.
    if (full && theme) root.setAttribute("data-themed", "");
    return () => {
      for (const [k] of entries) root.style.removeProperty(k);
      if (full) root.removeAttribute("data-themed");
    };
  }, [key, global, full, theme]);
  return (
    <div
      style={style}
      {...(full && theme ? { "data-themed": "" } : {})}
      className={cn(
        "bg-background font-sans text-foreground [&_h1,&_h2,&_h3,&_h4]:font-display",
        className,
      )}
    >
      {children}
    </div>
  );
}
