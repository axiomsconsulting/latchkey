import type { ReactNode } from "react";
import { brandName } from "@/lib/brand";
import { Link } from "@tanstack/react-router";
import { KeyRound, Repeat } from "lucide-react";

import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { guest as guestCopy } from "@/content/copy";
import type { ThemeConfig } from "@/lib/theme";

export function GuestFrame({
  children,
  theme,
  name,
  switchable = false,
}: {
  children: ReactNode;
  theme?: ThemeConfig | null;
  name?: string | undefined;
  /** Offer "checking in somewhere else?", which goes to PIN entry. Never on the kiosk. */
  switchable?: boolean;
}) {
  return (
    <ThemeScope theme={theme} global className="min-h-screen px-4 sm:px-8">
      <header className="mx-auto flex max-w-4xl items-center gap-3 pt-6 text-sm font-medium text-muted-foreground">
        {theme && name ? (
          <>
            <LogoMark theme={theme} name={name} />
            <span className="font-display text-lg text-foreground">{name}</span>
          </>
        ) : (
          <>
            <KeyRound className="size-4 text-primary" /> {brandName()}
          </>
        )}
        {switchable ? (
          <Link
            to="/checkin"
            aria-label={guestCopy.switchProperty}
            title={guestCopy.switchProperty}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <Repeat className="size-4" /> <span className="hidden sm:inline">{guestCopy.switchProperty}</span>
          </Link>
        ) : null}
      </header>
      {children}
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
