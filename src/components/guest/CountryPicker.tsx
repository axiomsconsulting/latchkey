import { useMemo, useState } from "react";
import { Check, Delete, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guest as copy } from "@/content/copy";
import { SHOW_MATCHES, flagEmoji, narrowCountries } from "@/lib/kiosk-register";
import { cn } from "@/lib/utils";

type Option = { code: string; name: string };

/**
 * Nationality on a door tablet: the usual answers as big buttons, then
 * letter keys that keep narrowing the list until the few that are left show
 * as buttons, each with its flag. Nothing scrolls and nothing is small.
 */
export function CountryPicker({
  options,
  usual,
  value,
  onChange,
  jumbo,
}: {
  options: Option[];
  /** Codes offered straight away: the property's country, then the guess from the ID. */
  usual: string[];
  value: string;
  onChange: (code: string) => void;
  jumbo: boolean;
}) {
  const [typed, setTyped] = useState("");
  const { matches, next } = useMemo(() => narrowCountries(options, typed), [options, typed]);
  const byCode = useMemo(() => new Map(options.map((o) => [o.code, o])), [options]);
  const quick = [...new Set([...usual, value].filter(Boolean))]
    .map((c) => byCode.get(c))
    .filter((o): o is Option => !!o)
    .slice(0, 3);
  const listing = typed.length > 0 && matches.length <= SHOW_MATCHES;

  const choice = (o: Option) => (
    <Button
      key={o.code}
      type="button"
      size="touch"
      variant={value === o.code ? "default" : "outline"}
      data-country
      className={cn("h-auto min-h-14 justify-start gap-3 text-left text-xl", jumbo && "min-h-0")}
      onClick={() => onChange(o.code)}
    >
      <span aria-hidden className="text-[1.6em] leading-none">
        {flagEmoji(o.code)}
      </span>
      <span className="min-w-0 flex-1 truncate">{o.name}</span>
      {value === o.code ? <Check className="size-6 shrink-0" aria-hidden /> : null}
    </Button>
  );

  return (
    <div data-country-picker={jumbo ? "jumbo" : ""} className="space-y-3">
      {!typed ? <div className="grid gap-2 sm:grid-cols-2">{quick.map(choice)}</div> : null}

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-lg font-medium" aria-live="polite">
          {typed ? copy.countryTyped(typed.replace(/ $/, " ␣")) : copy.countryLetters}
        </p>
        {typed ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="touch"
              aria-label={copy.countryDelete}
              onClick={() => setTyped((t) => t.slice(0, -1))}
            >
              <Delete className="size-6" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              aria-label={copy.countryClear}
              onClick={() => setTyped("")}
            >
              <RotateCcw className="size-6" />
            </Button>
          </>
        ) : null}
      </div>

      {listing ? (
        <div className="grid gap-2 sm:grid-cols-2">{matches.map(choice)}</div>
      ) : (
        <>
          <div data-letter-keys className="grid grid-cols-7 gap-2 sm:grid-cols-9">
            {next.map((ch) => (
              <Button
                key={ch}
                type="button"
                variant="outline"
                data-letter
                className={cn(
                  "h-14 px-0 text-2xl font-bold",
                  ch === " " && "col-span-2 text-base font-medium",
                )}
                onClick={() => setTyped((t) => t + ch)}
              >
                {ch === " " ? copy.countrySpace : ch}
              </Button>
            ))}
          </div>
          {typed ? (
            <p className="text-base text-muted-foreground">{copy.countryMore(matches.length)}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
