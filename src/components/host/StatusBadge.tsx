import {
  Ban,
  BedDouble,
  CalendarClock,
  CheckCheck,
  CircleHelp,
  CircleX,
  DoorOpen,
  Link2,
  LogOut,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { statuses } from "@/content/copy";
import type { StayState } from "@/lib/dates";

const variantFor: Record<string, "default" | "secondary" | "accent" | "success" | "outline"> = {
  needs_details: "accent",
  arriving_today: "default",
  in_stay: "success",
  departing_today: "secondary",
  upcoming: "outline",
  past: "outline",
  cancelled: "outline",
  blocked: "outline",
  checked_out: "outline",
  flagged: "accent",
};

export function StatusBadge({ state }: { state: StayState | string }) {
  const label = (statuses as Record<string, string>)[state] ?? state;
  return <Badge variant={variantFor[state] ?? "outline"}>{label}</Badge>;
}

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  in_stay: { icon: BedDouble, tone: "bg-success text-success-foreground" },
  checked_in: { icon: BedDouble, tone: "bg-success text-success-foreground" },
  arriving_today: { icon: DoorOpen, tone: "bg-primary text-primary-foreground" },
  departing_today: { icon: LogOut, tone: "bg-accent text-accent-foreground" },
  upcoming: { icon: CalendarClock, tone: "border border-border text-muted-foreground" },
  needs_details: { icon: CircleHelp, tone: "bg-accent/15 text-accent" },
  flagged: { icon: TriangleAlert, tone: "bg-destructive/10 text-destructive" },
  past: { icon: CheckCheck, tone: "text-muted-foreground" },
  checked_out: { icon: CheckCheck, tone: "text-muted-foreground" },
  cancelled: { icon: CircleX, tone: "text-destructive" },
  blocked: { icon: Ban, tone: "bg-muted text-muted-foreground" },
  mirror: { icon: Link2, tone: "bg-muted text-muted-foreground" },
};

/** The status as a small icon pill, with the words in a tooltip (and for screen readers). */
export function StatusIcon({
  state,
  detail,
}: {
  state: StayState | string;
  detail?: string | null;
}) {
  const label = (statuses as Record<string, string>)[state] ?? state;
  const { icon: Icon, tone } = ICONS[state] ?? { icon: CircleHelp, tone: "text-muted-foreground" };
  const text = detail ? `${label}: ${detail}` : label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={text}
          tabIndex={0}
          className={`inline-flex h-7 min-w-9 items-center justify-center rounded-full px-2 ${tone}`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
