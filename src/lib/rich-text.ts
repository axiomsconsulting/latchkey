/**
 * Simple formatting for guide text, kept as plain text with a few marks so
 * anything written before looks the same and nothing can inject HTML:
 *
 *   **bold**   *italic*   __underline__
 *   ## Large (the theme's heading font)   ### Medium   -# Small print
 *   - bullet   1. numbered
 *   | Day | Bins |      a table; a |---|---| line under the first row
 *   |---|---|          makes it the header
 *
 * Blank lines separate paragraphs; a single line break stays a line break.
 * Pure; tested in tests/rich-text.test.ts.
 */

export type Span = { text: string; b?: true; i?: true; u?: true };
export type Line = Span[];

export type Block =
  | { type: "p"; lines: Line[] }
  | { type: "h"; level: 2 | 3; text: Line }
  | { type: "small"; text: Line }
  | { type: "ul" | "ol"; items: Line[] }
  | { type: "table"; head: Line[] | null; rows: Line[][] };

const MARKS: Array<{ token: string; key: "b" | "i" | "u" }> = [
  { token: "**", key: "b" },
  { token: "__", key: "u" },
  { token: "*", key: "i" },
];

/** Bold, italic and underline within a line; a mark without its partner stays as typed. */
export function parseInline(text: string): Line {
  const out: Line = [];
  const on: { b?: true; i?: true; u?: true } = {};
  let buf = "";
  const flush = () => {
    if (!buf) return;
    out.push({ text: buf, ...on });
    buf = "";
  };
  let i = 0;
  while (i < text.length) {
    const m = MARKS.find((x) => text.startsWith(x.token, i));
    if (m) {
      const opening = !on[m.key];
      // Only a mark that closes later (or closes an open one) counts.
      if (!opening || text.indexOf(m.token, i + m.token.length) > i + m.token.length) {
        flush();
        if (opening) on[m.key] = true;
        else delete on[m.key];
        i += m.token.length;
        continue;
      }
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return out.length ? out : [{ text: "" }];
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const isRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const BULLET = /^\s*[-•]\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;

export function parseRich(text: string | null | undefined): Block[] {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: Line[] = [];
  const endPara = () => {
    if (para.length) blocks.push({ type: "p", lines: para });
    para = [];
  };
  let k = 0;
  while (k < lines.length) {
    const line = lines[k]!;
    if (!line.trim()) {
      endPara();
      k += 1;
      continue;
    }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      endPara();
      blocks.push({ type: "h", level: h[1]!.length === 2 ? 2 : 3, text: parseInline(h[2]!) });
      k += 1;
      continue;
    }
    const sm = /^-#\s+(.*)$/.exec(line);
    if (sm) {
      endPara();
      blocks.push({ type: "small", text: parseInline(sm[1]!) });
      k += 1;
      continue;
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      endPara();
      const kind = BULLET.test(line) ? "ul" : "ol";
      const re = kind === "ul" ? BULLET : NUMBER;
      const items: Line[] = [];
      while (k < lines.length && re.test(lines[k]!)) {
        items.push(parseInline(re.exec(lines[k]!)![1]!));
        k += 1;
      }
      blocks.push({ type: kind, items });
      continue;
    }
    if (isRow(line)) {
      endPara();
      const rows: string[] = [];
      while (k < lines.length && (isRow(lines[k]!) || isRule(lines[k]!))) {
        rows.push(lines[k]!);
        k += 1;
      }
      const hasHead = rows.length > 1 && isRule(rows[1]!);
      const body = rows.filter((r) => !isRule(r));
      const parsed = body.map((r) => cells(r).map(parseInline));
      blocks.push({
        type: "table",
        head: hasHead ? parsed[0]! : null,
        rows: hasHead ? parsed.slice(1) : parsed,
      });
      continue;
    }
    para.push(parseInline(line));
    k += 1;
  }
  endPara();
  return blocks;
}

/** Without the marks: for one-line previews, search and text messages. */
export function plainText(text: string | null | undefined): string {
  return parseRich(text)
    .map((b) => {
      const line = (l: Line) => l.map((s) => s.text).join("");
      switch (b.type) {
        case "p":
          return b.lines.map(line).join("\n");
        case "h":
        case "small":
          return line(b.text);
        case "ul":
          return b.items.map((x) => `• ${line(x)}`).join("\n");
        case "ol":
          return b.items.map((x, n) => `${n + 1}. ${line(x)}`).join("\n");
        case "table":
          return [...(b.head ? [b.head] : []), ...b.rows]
            .map((r) => r.map(line).join(" · "))
            .join("\n");
      }
    })
    .join("\n\n");
}

/** Whether the text uses any formatting (otherwise it shows exactly as before). */
export const isFormatted = (text: string | null | undefined): boolean =>
  parseRich(text).some((b) => b.type !== "p") ||
  parseRich(text).some(
    (b) => b.type === "p" && b.lines.some((l) => l.some((s) => s.b || s.i || s.u)),
  );

/* ------------------------------ the editor ------------------------------ */

export type Edit = { text: string; start: number; end: number };

/** Bold, italic or underline around the selection (or an empty pair to type into). */
export function wrapSelection(e: Edit, mark: "**" | "*" | "__"): Edit {
  const sel = e.text.slice(e.start, e.end);
  // Already wrapped: unwrap.
  const before = e.text.slice(e.start - mark.length, e.start);
  const after = e.text.slice(e.end, e.end + mark.length);
  if (
    sel &&
    before === mark &&
    after === mark &&
    !(mark === "*" && e.text.slice(e.start - 2, e.start) === "**")
  ) {
    return {
      text: e.text.slice(0, e.start - mark.length) + sel + e.text.slice(e.end + mark.length),
      start: e.start - mark.length,
      end: e.end - mark.length,
    };
  }
  // Marks hug the words: spaces selected at the edges stay outside.
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const s = e.start + lead;
  const t = e.end - trail;
  const inner = e.text.slice(s, t);
  return {
    text: e.text.slice(0, s) + mark + inner + mark + e.text.slice(t),
    start: s + mark.length,
    end: t + mark.length,
  };
}

const PREFIXES = ["## ", "### ", "-# ", "- ", "1. "] as const;
export type LineStyle = (typeof PREFIXES)[number] | "";

/** Every selected line as a heading, small print, bullet or numbered item (again to undo). */
export function styleLines(e: Edit, style: LineStyle): Edit {
  const from = e.text.lastIndexOf("\n", e.start - 1) + 1;
  const nl = e.text.indexOf("\n", e.end);
  const to = nl < 0 ? e.text.length : nl;
  const lines = e.text.slice(from, to).split("\n");
  const strip = (l: string) => l.replace(/^(#{2,3}\s+|-#\s+|[-•]\s+|\d{1,3}[.)]\s+)/, "");
  const has = (l: string) =>
    style === "1. " ? NUMBER.test(l) : style === "- " ? BULLET.test(l) : l.startsWith(style);
  const already = style !== "" && lines.every((l) => !l.trim() || has(l));
  const next = lines.map((l, n) => {
    if (!l.trim()) return l;
    const bare = strip(l);
    if (already || style === "") return bare;
    return (style === "1. " ? `${n + 1}. ` : style) + bare;
  });
  const out = next.join("\n");
  return {
    text: e.text.slice(0, from) + out + e.text.slice(to),
    start: from,
    end: from + out.length,
  };
}

/** A small table to fill in, on its own lines. */
export function insertTable(e: Edit, cols = 2, rows = 2): Edit {
  const row = (fill: (c: number) => string) =>
    `| ${Array.from({ length: cols }, (_, c) => fill(c)).join(" | ")} |`;
  const table = [
    row((c) => `Heading ${c + 1}`),
    row(() => "---"),
    ...Array.from({ length: rows }, () => row(() => " ")),
  ].join("\n");
  const before = e.text.slice(0, e.start);
  const after = e.text.slice(e.end);
  const pre = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const post = after && !after.startsWith("\n") ? "\n\n" : "";
  const text = before + pre + table + post + after;
  const start = before.length + pre.length + 2;
  return { text, start, end: start + "Heading 1".length };
}
