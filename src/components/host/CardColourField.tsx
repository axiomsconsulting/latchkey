import { CARD_COLOURS, cardEdge, cardInk } from "@/lib/checkout-goodbye";
import { kioskCardsCopy as copy } from "@/content/copy";
import { cn } from "@/lib/utils";

/** A card's colour on the door tablet: a few that read well from afar, or any colour. */
export function CardColourField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{copy.colour}</p>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={copy.colour}>
        {CARD_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn(
              "size-9 rounded-full border-[3px]",
              value === c && "ring-2 ring-ring ring-offset-2",
            )}
            style={{ background: c, borderColor: cardEdge(c) }}
          />
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="size-9 cursor-pointer rounded-full border border-border bg-transparent"
          />
          {copy.anyColour}
        </label>
      </div>
    </div>
  );
}

/** The card as the tablet shows it, in its colour. */
export function CardPreview({
  colour,
  label,
  text,
  button,
  children,
}: {
  colour: string;
  label: string;
  text: string;
  button: string;
  children?: React.ReactNode;
}) {
  const ink = cardInk(colour);
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: colour, color: ink, border: `5px solid ${cardEdge(colour)}` }}
    >
      <p className="text-xs uppercase tracking-[0.2em] opacity-80">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold leading-tight">{text}</p>
      {children}
      <p
        className="mt-4 rounded-full px-4 py-3 text-center text-lg font-bold"
        style={{ background: ink, color: colour }}
      >
        {button}
      </p>
    </div>
  );
}
