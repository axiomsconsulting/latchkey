import { describe, expect, it } from "vitest";

import { buildRecordingBookings } from "../src/lib/demo-data";
import { DEMO_CODES, isTour } from "../src/lib/demo-account";
import { SHOWCASE } from "../src/lib/demo-showcase";
import { BREAKFAST_STYLES } from "../src/lib/extras";
import { RESERVED_SLUGS, THEME_PRESETS } from "../src/lib/theme";
import { SECTIONS } from "../src/lib/guide";
import { TRADE_CATEGORIES } from "../src/lib/trade-contacts";

describe("regional demo properties", () => {
  it("has one property on each of the four hotel themes, in four places", () => {
    expect(SHOWCASE.map((s) => s.key)).toEqual(["texas", "mayfair", "paris", "tokyo"]);
    expect(new Set(SHOWCASE.map((s) => s.theme["presetId"]))).toEqual(new Set(["desert-star", "palace-heritage", "grand-crimson", "express-green"]));
    for (const s of SHOWCASE) expect(THEME_PRESETS.some((p) => p.presetId === s.theme["presetId"])).toBe(true);
    expect(new Set(SHOWCASE.map((s) => s.property.currency))).toEqual(new Set(["USD", "GBP", "EUR", "JPY"]));
  });

  it("uses each template's logo from the concept mockups", () => {
    const logos = Object.fromEntries(SHOWCASE.map((s) => [s.theme["presetId"], s.theme["logoPreset"]]));
    expect(logos).toEqual({ "desert-star": "sunburst", "palace-heritage": "lantern", "grand-crimson": "monogram", "express-green": "key" });
  });

  it("has its own links and campaign names, all reserved and treated as public tours", () => {
    const codes = SHOWCASE.map((s) => s.short_code);
    const campaigns = SHOWCASE.flatMap((s) => [s.campaign.guest, s.campaign.host]);
    expect(new Set(codes).size).toBe(4);
    expect(new Set(campaigns).size).toBe(8);
    for (const c of codes) {
      expect(RESERVED_SLUGS.has(c)).toBe(true);
      expect(DEMO_CODES).toContain(c);
      expect(isTour({ is_demo: true, short_code: c })).toBe(true);
      expect(isTour({ is_demo: false, short_code: c })).toBe(false);
    }
  });

  it("only uses phone numbers set aside for fiction (or obviously fake)", () => {
    const ok = (p: string) => /^\+1\d{3}55501\d{2}$/.test(p) || /^\+442079460\d{3}$/.test(p) || /^\+3319900\d{4}$/.test(p) || /^\+819000000\d{3}$/.test(p);
    for (const s of SHOWCASE) {
      expect(ok(s.property.host_contact_phone)).toBe(true);
      for (const t of s.trades) expect(ok(t.phone)).toBe(true);
    }
  });

  it("prefills local services, tradespeople and guide text that the app understands", () => {
    const sections = new Set(SECTIONS.map((x) => x.key as string));
    const trades = new Set(TRADE_CATEGORIES.map((x) => x.id));
    for (const s of SHOWCASE) {
      for (const g of s.guides) expect(sections.has(g.section_key)).toBe(true);
      for (const t of s.trades) expect(trades.has(t.category)).toBe(true);
      expect(new Set(s.extras.map((e) => e.key)).size).toBe(s.extras.length);
      // A breakfast menu for every way it's served.
      for (const style of BREAKFAST_STYLES) expect(s.extras.some((e) => e.breakfast?.style === style)).toBe(true);
    }
  });

  it("builds stays that never double-book, fit the room, and always have someone named arriving today", () => {
    for (const s of SHOWCASE) {
      const stays = buildRecordingBookings(s.rooms, { guests: s.guests, channels: s.channels, checkIn: s.checkIn, checkOut: s.checkOut, lateArrival: s.lateArrival, from: -10, to: 14, namedToday: true });
      expect(stays.some((b) => b.check_in_offset === 0 && b.guest_full_name)).toBe(true);
      for (const r of s.rooms) {
        const mine = stays.filter((b) => b.roomKey === r.key).sort((a, b) => a.check_in_offset - b.check_in_offset);
        for (let i = 1; i < mine.length; i++) expect(mine[i]!.check_in_offset).toBeGreaterThanOrEqual(mine[i - 1]!.check_out_offset);
        for (const b of mine) expect(b.guest_count).toBeLessThanOrEqual(r.max_guests);
      }
    }
  });
});
