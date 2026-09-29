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

export function ChannelBadge({ channel }: { channel: Channel }) {
  return <Badge variant={variants[channel] ?? "other"}>{channels[channel] ?? channel}</Badge>;
}
