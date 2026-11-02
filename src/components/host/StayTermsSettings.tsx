import { Info } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { stayTermsSettingsCopy as copy } from "@/content/copy";
import { MAX_STAY_LIMIT, countryAdvice, type StayTerms } from "@/lib/stay-terms";

const num = (v: string, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number(v.replace(/\D/g, "") || 0)));

/**
 * Direct stays → Book and pay here: the longest stay guests can book, from
 * how many nights they sign the longer-stay licence, how often the host goes
 * in to clean (the access the licence relies on), and the host's own house
 * rules. Advice for the property's country, and that it isn't legal advice.
 */
export function StayTermsSettings({
  value,
  country,
  onChange,
}: {
  value: StayTerms;
  country: string | null;
  onChange: (v: StayTerms) => void;
}) {
  const advice = countryAdvice(country);
  const set = (patch: Partial<StayTerms>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{copy.title}</legend>
      <div className="flex gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          {advice.note} {copy.notAdvice}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1 rounded-xl border border-border p-3 text-sm">
          <span className="block font-medium">{copy.maxNights}</span>
          <span className="flex items-center gap-2">
            <Input
              className="h-9 w-20"
              inputMode="numeric"
              value={String(value.maxNights)}
              onChange={(e) => set({ maxNights: num(e.target.value, 1, MAX_STAY_LIMIT) })}
              aria-label={copy.maxNights}
            />
            {copy.nights}
          </span>
          <span className="block text-xs text-muted-foreground">
            {copy.maxHelp(advice.suggestedMax)}
          </span>
        </label>
        <label className="space-y-1 rounded-xl border border-border p-3 text-sm">
          <span className="block font-medium">{copy.licenceFrom}</span>
          <span className="flex items-center gap-2">
            <Input
              className="h-9 w-20"
              inputMode="numeric"
              value={String(value.licenceFrom)}
              onChange={(e) => set({ licenceFrom: num(e.target.value, 0, MAX_STAY_LIMIT) })}
              aria-label={copy.licenceFrom}
            />
            {copy.nights}
          </span>
          <span className="block text-xs text-muted-foreground">{copy.licenceHelp}</span>
        </label>
        <label className="space-y-1 rounded-xl border border-border p-3 text-sm">
          <span className="block font-medium">{copy.serviceDays}</span>
          <span className="flex items-center gap-2">
            {copy.every}
            <Input
              className="h-9 w-16"
              inputMode="numeric"
              value={String(value.serviceDays)}
              onChange={(e) => set({ serviceDays: num(e.target.value, 1, 14) })}
              aria-label={copy.serviceDays}
            />
            {copy.days}
          </span>
          <span className="block text-xs text-muted-foreground">{copy.serviceHelp}</span>
        </label>
      </div>
      <div className="space-y-1">
        <label htmlFor="house-rules" className="text-sm font-medium">
          {copy.houseRules}
        </label>
        <Textarea
          id="house-rules"
          value={value.houseRules}
          maxLength={3000}
          placeholder={copy.houseRulesPlaceholder}
          onChange={(e) => set({ houseRules: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">{copy.houseRulesHelp}</p>
      </div>
    </fieldset>
  );
}
