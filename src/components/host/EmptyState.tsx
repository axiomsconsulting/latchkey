import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-soft flex flex-col items-center gap-3 p-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-6" />
      </div>
      <p className="font-display text-lg">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action}
    </div>
  );
}
