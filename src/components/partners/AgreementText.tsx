import { Fragment } from "react";

import type { Block, Inline } from "@/lib/partner-agreement";

/** The agreement's text, drawn from parsed blocks (never as HTML). */
export function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((i, n) =>
        i.bold ? (
          <strong key={n}>{i.text}</strong>
        ) : i.italic ? (
          <em key={n}>{i.text}</em>
        ) : i.code ? (
          <code key={n} className="rounded bg-muted px-1 text-[0.9em]">
            {i.text}
          </code>
        ) : (
          <Fragment key={n}>{i.text}</Fragment>
        ),
      )}
    </>
  );
}

export function AgreementBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, n) => {
        if (b.type === "heading") {
          const cls =
            b.level === 1
              ? "text-3xl"
              : b.level === 2
                ? "mt-8 scroll-mt-24 text-xl"
                : "mt-4 text-lg";
          const Tag = `h${Math.min(b.level + 1, 6)}` as "h2";
          return (
            <Tag key={n} id={b.id} className={cls}>
              {b.text.replace(/\*\*/g, "")}
            </Tag>
          );
        }
        if (b.type === "para")
          return (
            <p key={n} className="leading-relaxed">
              <Inlines items={b.inlines} />
            </p>
          );
        if (b.type === "list")
          return (
            <ul key={n} className="list-disc space-y-1 pl-6 leading-relaxed">
              {b.items.map((it, j) => (
                <li key={j}>
                  <Inlines items={it} />
                </li>
              ))}
            </ul>
          );
        if (b.type === "quote")
          return (
            <div key={n} className="card-soft space-y-3 border-l-4 border-primary p-4">
              <AgreementBlocks blocks={b.blocks} />
            </div>
          );
        if (b.type === "table")
          return (
            <div key={n} className="space-y-3">
              {b.rows.map((row, j) => (
                <dl key={j} className="rounded-xl border border-border p-3 text-sm">
                  {row.map((cell, k) => (
                    <div key={k} className="grid gap-1 py-1 sm:grid-cols-[12rem_1fr]">
                      <dt className="font-medium text-muted-foreground">
                        <Inlines items={b.header[k] ?? []} />
                      </dt>
                      <dd>
                        <Inlines items={cell} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ))}
            </div>
          );
        return <hr key={n} className="border-border" />;
      })}
    </>
  );
}
