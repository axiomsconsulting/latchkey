import { Badge } from "@/components/ui/badge";
import { channels } from "@/content/copy";

export type Channel = "airbnb" | "booking_com" | "homestay" | "direct" | "other";

const variants: Record<Channel, "airbnb" | "booking" | "homestay" | "direct" | "other"> = {
  airbnb: "airbnb",
  booking_com: "booking",
  homestay: "homestay",
  direct: "direct",
  other: "other",
};

export function ChannelBadge({ channel }: { channel: Channel }) {
  return <Badge variant={variants[channel]}>{channels[channel]}</Badge>;
}
