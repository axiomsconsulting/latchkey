import { AlertTriangle, Info } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { stayTermsSettingsCopy as copy } from "@/content/copy";
import {
  INSURANCE_KINDS,
  INSURANCE_LABELS,
  LICENCE_ALWAYS_OVER,
  MAX_STAY_LIMIT,
  stayLengthAdvice,
  type InsuranceKind,
  type StayTerms,
} from "@/lib/stay-terms";

const num = (v: string, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number(v.replace(/\D/g, "") || 0)));

/**
 * Direct stays → Book and pay here: the longest stay guests can book, from
 * how many nights they sign the longer-stay licence, how often the host goes
 * in to clean (the access the licence relies on), and the host's own house
 * rules. Advice for the property's country and the host's kind of insurance
 * (the policy's own longest stay wins), and that it isn't legal advice.
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
  const advice = stayLengthAdvice(country, value);
  const set = (patch: Partial<StayTerms>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{copy.title}</legend>
      <div className="flex gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          {advice.countryNote} {copy.notAdvice}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 rounded-xl border border-border p-3 text-sm">
          <span className="block font-medium">{copy.insurance}</span>
          <Select
            value={value.insurance ?? "unsure"}
            onValueChange={(v) => set({ insurance: v === "unsure" ? null : (v as InsuranceKind) })}
          >
            <SelectTrigger className="h-9" aria-label={copy.insurance}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSURANCE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {INSURANCE_LABELS[k]}
                </SelectItem>
              ))}
              <SelectItem value="unsure">{copy.insuranceUnsure}</SelectItem>
            </SelectContent>
          </Select>
          <span className="block text-xs text-muted-foreground">
            {advice.insuranceNote ?? copy.insuranceHelp}
          </span>
        </div>
        <label className="space-y-1 rounded-xl border border-border p-3 text-sm">
          <span className="block font-medium">{copy.policyMax}</span>
          <span className="flex items-center gap-2">
            <Input
              className="h-9 w-20"
              inputMode="numeric"
              placeholder="—"
              value={value.policyMaxNights ? String(value.policyMaxNights) : ""}
              onChange={(e) => {
                const n = num(e.target.value, 0, MAX_STAY_LIMIT);
                set({ policyMaxNights: n >= 1 ? n : null });
              }}
              aria-label={copy.policyMax}
            />
            {copy.nights}
          </span>
          <span className="block text-xs text-muted-foreground">{copy.policyHelp}</span>
        </label>
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
              onChange={(e) => set({ licenceFrom: num(e.target.value, 0, LICENCE_ALWAYS_OVER) })}
              aria-label={copy.licenceFrom}
            />
            {copy.nights}
          </span>
          <span className="block text-xs text-muted-foreground">
            {copy.licenceHelp(LICENCE_ALWAYS_OVER)}
          </span>
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
      {advice.warnings.map((w) => (
        <p
          key={w}
          role="status"
          className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          {w}
        </p>
      ))}
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
