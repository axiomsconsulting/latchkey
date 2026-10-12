import { Badge } from "@/components/ui/badge";
import { channels } from "@/content/copy";

export type Channel =
  | "airbnb"
  | "booking_com"
  | "homestay"
  | "vrbo"
  | "agoda"
  | "direct"
  | "other";

const variants: Record<
  Channel,
  "airbnb" | "booking" | "homestay" | "vrbo" | "agoda" | "direct" | "other"
> = {
  airbnb: "airbnb",
  booking_com: "booking",
  homestay: "homestay",
  vrbo: "vrbo",
  agoda: "agoda",
  direct: "direct",
  other: "other",
};

/** `label` is the host's own name for the site, including sites they added. */
export function ChannelBadge({ channel, label }: { channel: Channel; label?: string | undefined }) {
  return <Badge variant={variants[channel] ?? "other"}>{label ?? channels[channel] ?? channel}</Badge>;
}
