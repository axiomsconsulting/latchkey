import { useRef, useState } from "react";
import {
  Bold,
  Eye,
  EyeOff,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Table,
  Type,
  Underline,
} from "lucide-react";

import { RichText } from "@/components/RichText";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { richTextCopy as copy } from "@/content/copy";
import {
  insertTable,
  isFormatted,
  styleLines,
  wrapSelection,
  type Edit,
  type LineStyle,
} from "@/lib/rich-text";

/**
 * A guide text box with simple formatting (src/lib/rich-text.ts): bold,
 * italic, underline, Large / Medium / Small print, bullets, numbers and a
 * table, from a toolbar over the selection. "How guests see it" shows the
 * result in the property's fonts; the advice says which to use for what.
 */
export function RichTextField({
  id,
  value,
  onChange,
  maxLength,
  placeholder,
  ariaLabel,
  fonts,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  placeholder?: string;
  ariaLabel?: string;
  /** The theme's fonts, for the advice. */
  fonts?: { heading: string; body: string } | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function apply(fn: (e: Edit) => Edit) {
    const el = ref.current;
    const e = el
      ? { text: value, start: el.selectionStart, end: el.selectionEnd }
      : { text: value, start: value.length, end: value.length };
    const next = fn(e);
    if (next.text.length > maxLength) return;
    onChange(next.text);
    // Keep the words selected so another style can follow.
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.start, next.end);
    });
  }

  const tools: Array<{
    label: string;
    icon: typeof Bold;
    run: () => void;
  }> = [
    { label: copy.bold, icon: Bold, run: () => apply((e) => wrapSelection(e, "**")) },
    { label: copy.italic, icon: Italic, run: () => apply((e) => wrapSelection(e, "*")) },
    { label: copy.underline, icon: Underline, run: () => apply((e) => wrapSelection(e, "__")) },
    { label: copy.large, icon: Heading2, run: () => apply((e) => styleLines(e, "## ")) },
    { label: copy.medium, icon: Heading3, run: () => apply((e) => styleLines(e, "### ")) },
    { label: copy.small, icon: Type, run: () => apply((e) => styleLines(e, "-# ")) },
    { label: copy.bullets, icon: List, run: () => apply((e) => styleLines(e, "- ")) },
    { label: copy.numbers, icon: ListOrdered, run: () => apply((e) => styleLines(e, "1. ")) },
    { label: copy.table, icon: Table, run: () => apply((e) => insertTable(e)) },
  ];
  const clear = (style: LineStyle) => apply((e) => styleLines(e, style));

  return (
    <div className="rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="no-scrollbar flex items-center gap-0.5 overflow-x-auto border-b border-border p-1"
      >
        {tools.map((t) => (
          <Button
            key={t.label}
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            title={t.label}
            aria-label={t.label}
            // Keeps the selection in the text box.
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.run}
          >
            <t.icon className="size-4" aria-hidden />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => clear("")}
          title={copy.plainTitle}
        >
          {copy.plain}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          aria-pressed={preview}
          onClick={() => setPreview((v) => !v)}
        >
          {preview ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
          {copy.preview}
        </Button>
      </div>
      <Textarea
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className="min-h-28 rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
      />
      {preview ? (
        <div className="border-t border-border p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            {copy.previewTitle}
          </p>
          {value.trim() ? (
            <RichText text={value} className="text-base" />
          ) : (
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          )}
          {isFormatted(value) ? (
            <p className="mt-3 text-xs text-muted-foreground">{copy.advice(fonts ?? null)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
