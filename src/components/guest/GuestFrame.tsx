import type { ReactNode } from "react";
import { brandName } from "@/lib/brand";
import { Link } from "@tanstack/react-router";
import { Repeat } from "lucide-react";

import { SiteLogoMark } from "@/components/brand/BrandLogo";
import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { ThemeBackdrop, ThemeFooter } from "@/components/theme/ThemeDecor";
import { guest as guestCopy } from "@/content/copy";
import type { ThemeConfig } from "@/lib/theme";

export function GuestFrame({
  children,
  theme,
  name,
  switchable = false,
  wide = false,
}: {
  children: ReactNode;
  theme?: ThemeConfig | null;
  name?: string | undefined;
  /** Offer "checking in somewhere else?", which goes to PIN entry. Never on the kiosk. */
  switchable?: boolean;
  /** Wide pages (the booking page): the header, band and footer line up with the wider content. */
  wide?: boolean;
}) {
  const band = !!(theme?.headerBand && name);
  const width = wide ? "max-w-6xl" : "max-w-4xl";
  return (
    <ThemeScope theme={theme} global full className="relative min-h-screen px-4 sm:px-8">
      {theme ? <ThemeBackdrop theme={theme} /> : null}
      {/* The property's band of colour across the top, when the theme has one. */}
      {band && theme && name ? (
        <div className="relative -mx-4 bg-primary px-4 text-primary-foreground sm:-mx-8 sm:px-8">
          <div className={`mx-auto flex ${width} items-center gap-4 py-5`}>
            <LogoMark theme={theme} name={name} className="size-14 bg-transparent text-2xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-2xl uppercase leading-tight tracking-[0.08em] sm:text-3xl">
                {name}
              </p>
              {theme.subname ? (
                <p className="truncate text-sm uppercase tracking-[0.4em] opacity-90">
                  {theme.subname}
                </p>
              ) : null}
            </div>
            {switchable ? (
              <Link
                to="/checkin"
                aria-label={guestCopy.switchProperty}
                title={guestCopy.switchProperty}
                className="grid min-h-11 min-w-11 place-items-center rounded-full opacity-90 hover:opacity-100"
              >
                <Repeat className="size-5" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      <header
        className={
          band
            ? "hidden"
            : `relative mx-auto flex ${width} items-center gap-3 pt-6 text-sm font-medium text-muted-foreground`
        }
      >
        {theme && name ? (
          <>
            <LogoMark theme={theme} name={name} />
            <span className="min-w-0">
              <span className="block truncate font-display text-lg text-foreground">{name}</span>
              {theme.subname ? (
                <span className="block truncate text-xs uppercase tracking-[0.25em]">
                  {theme.subname}
                </span>
              ) : null}
            </span>
          </>
        ) : (
          <>
            <SiteLogoMark className="size-6 rounded-lg" /> {brandName()}
          </>
        )}
        {switchable ? (
          <Link
            to="/checkin"
            aria-label={guestCopy.switchProperty}
            title={guestCopy.switchProperty}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <Repeat className="size-4" />{" "}
            <span className="hidden sm:inline">{guestCopy.switchProperty}</span>
          </Link>
        ) : null}
      </header>
      <div className="relative">{children}</div>
      {theme ? (
        <ThemeFooter theme={theme} className={`relative mx-auto mt-6 ${width} pb-8`} />
      ) : null}
    </ThemeScope>
  );
}

export function GuestMessage({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="card-soft p-8 text-center text-xl">{text}</div>
    </div>
  );
}
