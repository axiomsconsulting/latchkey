import { Fragment } from "react";

import { parseInline, parseRich, type Block, type Line } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/** One line's bold, italic and underlined words. */
function Spans({ line }: { line: Line }) {
  return (
    <>
      {line.map((s, i) => {
        let node: React.ReactNode = s.text;
        if (s.u) node = <u className="underline-offset-2">{node}</u>;
        if (s.i) node = <em>{node}</em>;
        if (s.b) node = <strong className="font-semibold">{node}</strong>;
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

/** One block of guide text in the theme's fonts and colours (src/lib/rich-text.ts). */
export function RichBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return (
        <p>
          {block.lines.map((l, i) => (
            <Fragment key={i}>
              {i ? <br /> : null}
              <Spans line={l} />
            </Fragment>
          ))}
        </p>
      );
    case "h":
      return block.level === 2 ? (
        <p className="font-display text-xl leading-snug text-foreground">
          <Spans line={block.text} />
        </p>
      ) : (
        <p className="font-display text-lg leading-snug text-foreground">
          <Spans line={block.text} />
        </p>
      );
    case "small":
      return (
        <p className="text-sm text-muted-foreground">
          <Spans line={block.text} />
        </p>
      );
    case "ul":
    case "ol": {
      const List = block.type === "ul" ? "ul" : "ol";
      return (
        <List
          className={cn(
            "space-y-1 pl-6 marker:text-primary",
            block.type === "ul" ? "list-disc" : "list-decimal",
          )}
        >
          {block.items.map((l, i) => (
            <li key={i}>
              <Spans line={l} />
            </li>
          ))}
        </List>
      );
    }
    case "table":
      // Scrolls inside itself on a narrow phone; the page never scrolls sideways.
      return (
        <div className="max-w-full overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-left text-[0.95em]">
            {block.head ? (
              <thead className="bg-muted">
                <tr>
                  {block.head.map((c, i) => (
                    <th key={i} className="border-b border-border px-3 py-2 font-semibold">
                      <Spans line={c} />
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="border-t border-border first:border-t-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 align-top">
                      <Spans line={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Guide text with its formatting; plain text shows as before. */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {parseRich(text).map((b, i) => (
        <RichBlock key={i} block={b} />
      ))}
    </div>
  );
}

/** One line with its bold, italic and underline (a section's top line). */
export function RichLine({ text }: { text: string }) {
  return <Spans line={parseInline(text)} />;
}
