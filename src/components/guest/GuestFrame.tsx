import type { ReactNode } from "react";
import { KeyRound } from "lucide-react";

export function GuestFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 sm:px-8">
      <header className="mx-auto flex max-w-4xl items-center gap-2 pt-6 text-sm font-medium text-muted-foreground">
        <KeyRound className="size-4 text-primary" /> Latchkey
      </header>
      {children}
    </div>
  );
}

export function GuestMessage({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="card-soft p-8 text-center text-xl">{text}</div>
    </div>
  );
}
