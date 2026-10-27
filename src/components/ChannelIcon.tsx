/**
 * Simple wordmark-style marks for each booking platform. Drawn rather than
 * fetched so the check-in screen works offline on a kiosk, and tinted from
 * each platform's own colour so guests recognise where they booked at a
 * glance without reading. A host-uploaded icon replaces the drawn mark, and
 * sites the host added get the first letter of their name.
 */
const MARKS: Record<string, { letter: string; bg: string; fg: string }> = {
  airbnb: { letter: "A", bg: "#ff5a5f", fg: "#ffffff" },
  booking_com: { letter: "B", bg: "#003580", fg: "#ffffff" },
  homestay: { letter: "H", bg: "#00a99d", fg: "#ffffff" },
  vrbo: { letter: "V", bg: "#0c3161", fg: "#ffffff" },
  agoda: { letter: "a", bg: "#5c2d91", fg: "#ffffff" },
  direct: { letter: "★", bg: "#2f5d4f", fg: "#ffffff" },
  other: { letter: "?", bg: "#64748b", fg: "#ffffff" },
};

export function ChannelIcon({
  channel,
  size = 40,
  iconUrl,
  label,
}: {
  channel: string;
  /** Pixels, or a CSS length such as "1em" to sit inside a line of text. */
  size?: number | string;
  iconUrl?: string | null;
  label?: string;
}) {
  const box = typeof size === "number" ? `${size}px` : size;
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        aria-hidden
        className="inline-block shrink-0 rounded-[22%] object-contain align-middle"
        style={{ width: box, height: box }}
      />
    );
  }
  const m = MARKS[channel] ?? {
    ...MARKS["other"]!,
    letter: label?.trim().charAt(0).toUpperCase() || "?",
  };
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-[22%] align-middle font-semibold leading-none"
      style={{ width: box, height: box, background: m.bg, color: m.fg }}
    >
      {/* The letter sizes itself inside, so an "em" box keeps the text's size. */}
      <span style={{ fontSize: `calc(${box} * 0.5)` }}>{m.letter}</span>
    </span>
  );
}
