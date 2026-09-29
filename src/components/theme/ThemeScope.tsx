import { useEffect, type CSSProperties, type ReactNode } from "react";

import { googleFontsHref, themeVars, type ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Loads the fonts a theme needs (Google preset fonts and any uploaded font). */
export function useThemeFonts(theme: ThemeConfig | null | undefined) {
  const href = theme ? googleFontsHref(theme) : null;
  const custom = theme?.customFontUrl && theme.customFontName ? { url: theme.customFontUrl, name: theme.customFontName } : null;

  useEffect(() => {
    if (!href) return;
    const id = `lk-font-${href}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [href]);

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
}: {
  theme: ThemeConfig | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  useThemeFonts(theme);
  const vars = theme ? themeVars(theme) : {};
  const style = vars as CSSProperties;
  const key = JSON.stringify(vars);

  // Also theme the page root so dialogs and menus (rendered outside) match.
  useEffect(() => {
    const root = document.documentElement;
    const entries = Object.entries(JSON.parse(key) as Record<string, string>);
    for (const [k, v] of entries) root.style.setProperty(k, v);
    return () => {
      for (const [k] of entries) root.style.removeProperty(k);
    };
  }, [key]);
  return (
    <div
      style={style}
      className={cn("bg-background font-sans text-foreground [&_h1,&_h2,&_h3,&_h4]:font-display", className)}
    >
      {children}
    </div>
  );
}
