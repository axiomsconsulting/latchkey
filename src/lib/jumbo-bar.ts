/**
 * Jumbo's top bar: the property's name on the left, the time and date roughly in the
 * middle, the tablet's icons on the right. The clock stays centred while the name fits to
 * its left; a longer name pushes it right, never into the icons; then the clock shows the
 * time alone; and a name too long even then keeps the space left and scrolls (JumboName).
 * All in pixels, measured on the screen. Pure, so it can be tested.
 */
export type BarSizes = {
  /** The whole bar. */
  width: number;
  /** The icons on the right (mute, voice, bell, sun, phone QR), however many there are. */
  icons: number;
  /** "14:05 Wed 11 Nov" and "14:05". */
  clock: number;
  clockShort: number;
  /** The logo and the whole name, unshortened. */
  name: number;
  gap: number;
};

export type BarLayout = {
  compact: boolean;
  /** Where the clock starts, from the bar's left edge. */
  clockLeft: number;
  /** The space the name (with its logo) gets. */
  nameWidth: number;
  scroll: boolean;
};

export function jumboBarLayout(m: BarSizes): BarLayout {
  const limit = m.width - m.icons - m.gap;
  for (const [clock, compact] of [
    [m.clock, false],
    [m.clockShort, true],
  ] as const) {
    const left = Math.max((m.width - clock) / 2, m.name + m.gap);
    if (left + clock <= limit)
      return { compact, clockLeft: left, nameWidth: m.name, scroll: false };
  }
  const clockLeft = Math.max(0, limit - m.clockShort);
  return { compact: true, clockLeft, nameWidth: Math.max(0, clockLeft - m.gap), scroll: true };
}
