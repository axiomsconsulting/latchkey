import { Badge } from "@/components/ui/badge";

export type Channel = "airbnb" | "booking" | "homestay" | "direct";

const labels: Record<Channel, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  homestay: "Homestay.com",
  direct: "Direct",
};

export function ChannelBadge({ channel }: { channel: Channel }) {
  return <Badge variant={channel}>{labels[channel]}</Badge>;
}
