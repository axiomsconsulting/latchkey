import { Badge } from "@/components/ui/badge";
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
