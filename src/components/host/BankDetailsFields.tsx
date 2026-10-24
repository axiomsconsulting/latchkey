import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bankCopy as copy } from "@/content/copy";
import { bankFields, bankLinesFor, bankProblems, type BankAccount } from "@/lib/bank-details";
import { phoneCountries } from "@/lib/world";

/**
 * The host's bank details as the bank's country asks for them (sort code and
 * account number in the UK, IBAN across Europe, routing number in the US…),
 * each checked as it's typed, with a preview of what guests at home and
 * abroad will see.
 */
export function BankDetailsFields({ value, onChange }: { value: BankAccount; onChange: (next: BankAccount) => void }) {
  const { local, international } = bankFields(value.country);
  const problems = bankProblems(value);
  const problemFor = (key: string) => (value[key as keyof BankAccount] ? problems.find((p) => p.key === key)?.message : undefined);
  const field = (f: (typeof local)[number]) => {
    const problem = problemFor(f.key);
    return (
      <div key={f.key} className="space-y-1">
        <Label htmlFor={`bank-${f.key}`} className="text-xs">
          {f.label}
          {f.required ? null : <span className="text-muted-foreground"> {copy.optional}</span>}
        </Label>
        <Input
          id={`bank-${f.key}`}
          className={problem ? "h-10 border-destructive" : "h-10"}
          placeholder={f.placeholder}
          value={value[f.key]}
          aria-invalid={!!problem}
          onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
        />
        {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
      </div>
    );
  };
  const home = bankLinesFor(value, value.country);
  const abroad = bankLinesFor(value, value.country === "FR" ? "DE" : "FR");
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="bank-country" className="block text-xs">{copy.country}</Label>
        <select id="bank-country" className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm sm:w-72" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })}>
          {phoneCountries().map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{local.map(field)}</div>
      {international.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{copy.forAbroad}</p>
          <div className="grid gap-3 sm:grid-cols-2">{international.map(field)}</div>
        </div>
      ) : null}
      {value.accountName ? (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {[
            [copy.seenHome, home],
            [copy.seenAbroad, abroad],
          ].map(([title, lines]) => (
            <div key={title as string} className="rounded-xl bg-muted p-2.5">
              <p className="mb-1 font-medium">{title as string}</p>
              {(lines as Array<{ label: string; value: string }>).map((l) => (
                <p key={l.label}>
                  <span className="text-muted-foreground">{l.label}:</span> <span className="font-mono">{l.value}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
