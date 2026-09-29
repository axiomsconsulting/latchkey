import type { ReactNode } from "react";
import { KeyRound } from "lucide-react";

import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import type { ThemeConfig } from "@/lib/theme";

export function GuestFrame({
  children,
  theme,
  name,
}: {
  children: ReactNode;
  theme?: ThemeConfig | null;
  name?: string | undefined;
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
            <KeyRound className="size-4 text-primary" /> Latchkey
          </>
        )}
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
