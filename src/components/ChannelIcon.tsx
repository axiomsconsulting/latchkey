import type { Channel } from "@/components/ChannelBadge";

/**
 * Simple wordmark-style marks for each booking platform. Drawn rather than
 * fetched so the check-in screen works offline on a kiosk, and tinted from
 * each platform's own colour so guests recognise where they booked at a
 * glance without reading.
 */
const MARKS: Record<Channel, { letter: string; bg: string; fg: string }> = {
  airbnb: { letter: "A", bg: "#ff5a5f", fg: "#ffffff" },
  booking_com: { letter: "B", bg: "#003580", fg: "#ffffff" },
  homestay: { letter: "H", bg: "#00a99d", fg: "#ffffff" },
  vrbo: { letter: "V", bg: "#0c3161", fg: "#ffffff" },
  agoda: { letter: "a", bg: "#5c2d91", fg: "#ffffff" },
  direct: { letter: "★", bg: "#2f5d4f", fg: "#ffffff" },
  other: { letter: "?", bg: "#64748b", fg: "#ffffff" },
};

export function ChannelIcon({ channel, size = 40 }: { channel: Channel; size?: number }) {
  const m = MARKS[channel] ?? MARKS.other;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-xl font-semibold"
      style={{ width: size, height: size, background: m.bg, color: m.fg, fontSize: size * 0.5 }}
    >
      {m.letter}
    </span>
  );
}
