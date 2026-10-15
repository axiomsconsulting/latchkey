import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { worldCopy as copy } from "@/content/copy";
import { checkPhone, currencies, phoneCountries, phoneExample, timeZones } from "@/lib/world";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string; hint?: string | undefined; search: string };

/** A searchable list in a popover; shared by the pickers below. */
function Picker({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  shown,
  className,
}: {
  id?: string | undefined;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean | undefined;
  shown?: string | undefined;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-12 w-full justify-between font-normal", className)}
        >
          <span className="truncate">{shown ?? current?.label ?? value ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{copy.nothing}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.search}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint ? <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Every currency, shown with its symbol: "£ GBP · British Pound". */
export function CurrencyPicker({ id, value, onChange, disabled }: { id?: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const options = useMemo(
    () => currencies().map((c) => ({ value: c.code, label: `${c.symbol !== c.code ? `${c.symbol} ` : ""}${c.code} · ${c.name}`, search: `${c.code} ${c.name} ${c.symbol}` })),
    [],
  );
  return <Picker id={id} value={value} options={options} onChange={onChange} placeholder={copy.findCurrency} disabled={disabled} />;
}

/** Every time zone, west to east, with today's offset from UTC. */
export function TimeZonePicker({ id, value, onChange, disabled }: { id?: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const options = useMemo(() => timeZones().map((z) => ({ value: z.id, label: z.label, search: `${z.id} ${z.label}` })), []);
  return <Picker id={id} value={value} options={options} onChange={onChange} placeholder={copy.findZone} disabled={disabled} />;
}

/**
 * A country code picker and the number, checked against that country's
 * format as you type. `onChange` gets the number and whether it's valid.
 */
export function PhoneInput({
  id,
  country,
  national,
  onChange,
  disabled,
}: {
  id?: string;
  country: string;
  national: string;
  onChange: (next: { country: string; national: string; valid: boolean; e164: string | null }) => void;
  disabled?: boolean;
}) {
  const options = useMemo(
    () => phoneCountries().map((c) => ({ value: c.iso, label: `${c.flag} ${c.name}`, hint: c.dial, search: `${c.name} ${c.iso} ${c.dial}` })),
    [],
  );
  const here = phoneCountries().find((c) => c.iso === country);
  const check = national.trim() ? checkPhone(national, country) : null;
  const emit = (c: string, n: string) => {
    const r = n.trim() ? checkPhone(n, c) : null;
    onChange({ country: c, national: n, valid: !r || r.ok, e164: r && r.ok ? r.e164 : null });
  };
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Picker
          value={country}
          options={options}
          onChange={(c) => emit(c, national)}
          placeholder={copy.findCountry}
          disabled={disabled}
          shown={here ? `${here.flag} ${here.dial}` : country}
          className="w-28 shrink-0"
        />
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className={cn("h-12", check && !check.ok && "border-destructive focus-visible:ring-destructive")}
          value={national}
          placeholder={phoneExample(country)}
          disabled={disabled}
          aria-invalid={check ? !check.ok : undefined}
          onChange={(e) => emit(country, e.target.value)}
        />
      </div>
      {check && !check.ok ? (
        <p className="text-sm text-destructive">{copy.badPhone(here?.name ?? country, phoneExample(country))}</p>
      ) : check?.ok ? (
        <p className="text-xs text-muted-foreground">{check.display}</p>
      ) : null}
    </div>
  );
}
