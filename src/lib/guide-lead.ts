/**
 * A guide section's top line, shown under its heading whether it's open or
 * folded, and the rest of its text, shown when open. The top line is the
 * first line, or the first sentence of it when that's long. Pure.
 */
export function splitLead(text: string | null | undefined): { lead: string; rest: string } {
  const t = (text ?? "").trim();
  if (!t) return { lead: "", rest: "" };
  const nl = t.indexOf("\n");
  const firstLine = nl >= 0 ? t.slice(0, nl) : t;
  const after = nl >= 0 ? t.slice(nl + 1).trim() : "";
  if (firstLine.length <= 140) return { lead: firstLine.trim(), rest: after };
  const m = /^(.{20,140}?[.!?])\s+(.*)$/s.exec(firstLine);
  if (m) return { lead: m[1]!.trim(), rest: [m[2]!.trim(), after].filter(Boolean).join("\n") };
  return { lead: firstLine.trim(), rest: after };
}
