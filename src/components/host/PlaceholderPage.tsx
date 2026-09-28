import type { LucideIcon } from "lucide-react";

import { hostPlaceholders } from "@/content/copy";
import { Badge } from "@/components/ui/badge";

export function PlaceholderPage({
  title,
  body,
  icon: Icon,
  children,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
            <Icon className="size-6" />
          </div>
          <h1 className="truncate text-2xl sm:text-3xl">{title}</h1>
        </div>
        <Badge variant="outline">{hostPlaceholders.comingSoon}</Badge>
      </header>

      <div className="card-soft mt-6 p-6 sm:p-8">
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">{body}</p>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </div>
  );
}
