import { describe, expect, it } from "vitest";

import {
  insertTable,
  isFormatted,
  parseInline,
  parseRich,
  plainText,
  styleLines,
  wrapSelection,
} from "@/lib/rich-text";

describe("guide text formatting", () => {
  it("leaves plain text exactly as it was", () => {
    const t = "Check-in is from 3pm.\nThe key safe is by the door.\n\nWi-Fi: Hill-5G";
    expect(parseRich(t)).toEqual([
      {
        type: "p",
        lines: [[{ text: "Check-in is from 3pm." }], [{ text: "The key safe is by the door." }]],
      },
      { type: "p", lines: [[{ text: "Wi-Fi: Hill-5G" }]] },
    ]);
    expect(isFormatted(t)).toBe(false);
    expect(plainText(t)).toBe(t);
  });

  it("reads bold, italic and underline, and leaves a lone mark as typed", () => {
    expect(parseInline("Code **1234** please")).toEqual([
      { text: "Code " },
      { text: "1234", b: true },
      { text: " please" },
    ]);
    expect(parseInline("*quiet* and __gate__")).toEqual([
      { text: "quiet", i: true },
      { text: " and " },
      { text: "gate", u: true },
    ]);
    expect(parseInline("2 * 3 = 6")).toEqual([{ text: "2 * 3 = 6" }]);
    expect(parseInline("**bold *and italic***")).toEqual([
      { text: "bold ", b: true },
      { text: "and italic", b: true, i: true },
    ]);
  });

  it("reads sizes, lists and tables", () => {
    const t = [
      "## Bins",
      "### Which day",
      "| Day | Bin |",
      "|---|---|",
      "| Monday | **Black** |",
      "| Thursday | Recycling |",
      "",
      "- Rinse tins",
      "- Flatten boxes",
      "1. Open the gate",
      "2. Leave the bins",
      "-# Collected from 7am",
    ].join("\n");
    const b = parseRich(t);
    expect(b.map((x) => x.type)).toEqual(["h", "h", "table", "ul", "ol", "small"]);
    const table = b[2] as Extract<(typeof b)[number], { type: "table" }>;
    expect(table.head?.map((c) => c[0]!.text)).toEqual(["Day", "Bin"]);
    expect(table.rows[0]![1]).toEqual([{ text: "Black", b: true }]);
    expect(isFormatted(t)).toBe(true);
    expect(plainText("## Bins\n- Rinse **tins**")).toBe("Bins\n\n• Rinse tins");
  });

  it("reads a table without a header row", () => {
    const [t] = parseRich("| Wi-Fi | Hill-5G |\n| Password | sunflower |");
    expect(t).toMatchObject({ type: "table", head: null });
  });

  it("wraps and unwraps the selection, keeping spaces outside", () => {
    const e = wrapSelection({ text: "Door code 1234 now", start: 9, end: 15 }, "**");
    expect(e.text).toBe("Door code **1234** now");
    expect(e.text.slice(e.start, e.end)).toBe("1234");
    const back = wrapSelection(e, "**");
    expect(back.text).toBe("Door code 1234 now");
    expect(wrapSelection({ text: "ab", start: 1, end: 1 }, "__").text).toBe("a____b");
  });

  it("turns lines into headings, bullets or numbers, and back", () => {
    const e = { text: "Intro\nOne\nTwo", start: 6, end: 13 };
    const list = styleLines(e, "1. ");
    expect(list.text).toBe("Intro\n1. One\n2. Two");
    expect(styleLines(list, "1. ").text).toBe("Intro\nOne\nTwo");
    expect(styleLines(list, "- ").text).toBe("Intro\n- One\n- Two");
    expect(styleLines({ text: "Bins", start: 0, end: 0 }, "## ").text).toBe("## Bins");
  });

  it("puts a table on its own lines", () => {
    const e = insertTable({ text: "Times:", start: 6, end: 6 });
    expect(e.text.startsWith("Times:\n\n| Heading 1 | Heading 2 |\n| --- | --- |")).toBe(true);
    expect(e.text.slice(e.start, e.end)).toBe("Heading 1");
    expect(parseRich(e.text)[1]).toMatchObject({ type: "table" });
  });
});

describe("a guide section's top line with formatting", () => {
  it("has none when the text starts with a heading, list or table", async () => {
    const { splitLeadRich } = await import("@/lib/guide-lead");
    expect(splitLeadRich("## Bins\nMonday")).toEqual({ lead: "", rest: "## Bins\nMonday" });
    expect(splitLeadRich("Network **Hill-5G**\nAsk us")).toEqual({
      lead: "Network **Hill-5G**",
      rest: "Ask us",
    });
  });
});
