import { useMemo } from "react";

import { AgreementBlocks } from "@/components/partners/AgreementText";
import { SignaturePad } from "@/components/partners/SignaturePad";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { stayTermsCopy as copy } from "@/content/copy";
import { parseMarkdown } from "@/lib/partner-agreement";
import {
  PURPOSES,
  PURPOSE_LABELS,
  TICK_TEXT,
  ticksFor,
  type HomeAddress,
  type Purpose,
  type TermsAnswers,
} from "@/lib/stay-terms";
import { phoneCountries } from "@/lib/world";

/** The text exactly as the server rendered it (and will keep), in a box to scroll through. */
function TermsBox({ text, label }: { text: string; label: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <section
      aria-label={label}
      tabIndex={0}
      className="max-h-72 overflow-y-auto rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed [&_h2]:text-xl [&_h3]:mt-4 [&_h3]:text-base [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2"
    >
      <AgreementBlocks blocks={blocks} />
    </section>
  );
}

/**
 * What a guest reads and agrees to for a direct stay (src/lib/stay-terms.ts):
 * the booking terms with one tick, and for a longer stay the licence, their
 * permanent home address, why they're staying, the declarations, their typed
 * name and a drawn signature. The texts come from the server, word for word
 * as they'll be kept.
 */
export function StayTermsForm({
  termsText,
  licenceText,
  value,
  onChange,
}: {
  termsText: string;
  licenceText: string | null;
  value: TermsAnswers;
  onChange: (v: TermsAnswers) => void;
}) {
  const countries = useMemo(() => phoneCountries(), []);
  const licence = !!licenceText;
  const tick = (t: string, on: boolean) =>
    onChange({
      ...value,
      ticks: on ? [...new Set([...value.ticks, t])] : value.ticks.filter((x) => x !== t),
    });
  const addr = (k: keyof HomeAddress, v: string) =>
    onChange({ ...value, homeAddress: { ...value.homeAddress, [k]: v } });
  const box = (t: string) => (
    <label key={t} className="flex items-start gap-3 rounded-2xl bg-muted p-3 text-sm">
      <Checkbox
        checked={value.ticks.includes(t)}
        onCheckedChange={(v) => tick(t, v === true)}
        className="mt-0.5"
      />
      <span>{TICK_TEXT[t as keyof typeof TICK_TEXT]}</span>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="font-medium">{copy.termsTitle}</p>
        <TermsBox text={termsText} label={copy.termsTitle} />
        {box("terms")}
      </div>
      {licence ? (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <p className="font-display text-xl">{copy.licenceTitle}</p>
          <p className="text-sm text-muted-foreground">{copy.licenceIntro}</p>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">{copy.home}</legend>
            <Input
              aria-label={copy.line1}
              placeholder={copy.line1}
              autoComplete="address-line1"
              value={value.homeAddress.line1}
              onChange={(e) => addr("line1", e.target.value)}
              className="sm:col-span-2"
            />
            <Input
              aria-label={copy.line2}
              placeholder={copy.line2}
              autoComplete="address-line2"
              value={value.homeAddress.line2}
              onChange={(e) => addr("line2", e.target.value)}
              className="sm:col-span-2"
            />
            <Input
              aria-label={copy.city}
              placeholder={copy.city}
              autoComplete="address-level2"
              value={value.homeAddress.city}
              onChange={(e) => addr("city", e.target.value)}
            />
            <Input
              aria-label={copy.postcode}
              placeholder={copy.postcode}
              autoComplete="postal-code"
              value={value.homeAddress.postcode}
              onChange={(e) => addr("postcode", e.target.value)}
            />
            <Select value={value.homeAddress.country} onValueChange={(v) => addr("country", v)}>
              <SelectTrigger className="h-11 sm:col-span-2" aria-label={copy.country}>
                <SelectValue placeholder={copy.country} />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.iso} value={c.iso}>
                    {c.flag} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </fieldset>
          <div className="space-y-1">
            <Label>{copy.purpose}</Label>
            <Select
              value={value.purpose ?? ""}
              onValueChange={(v) => onChange({ ...value, purpose: v as Purpose })}
            >
              <SelectTrigger className="h-11" aria-label={copy.purpose}>
                <SelectValue placeholder={copy.purposePick} />
              </SelectTrigger>
              <SelectContent>
                {PURPOSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PURPOSE_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TermsBox text={licenceText!} label={copy.licenceTitle} />
          {ticksFor(true)
            .filter((t) => t !== "terms")
            .map(box)}
          <div className="space-y-1">
            <Label htmlFor="typed-name">{copy.typedName}</Label>
            <Input
              id="typed-name"
              autoComplete="name"
              value={value.typedName}
              onChange={(e) => onChange({ ...value, typedName: e.target.value })}
            />
          </div>
          <SignaturePad
            label={copy.signature}
            onChange={(signature) => onChange({ ...value, signature })}
          />
          <p className="text-xs text-muted-foreground">{copy.kept}</p>
        </div>
      ) : null}
    </div>
  );
}
