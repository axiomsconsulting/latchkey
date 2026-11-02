import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, FileSignature, Loader2, PenLine } from "lucide-react";

import { AgreementBlocks } from "@/components/partners/AgreementText";
import { SignaturePad } from "@/components/partners/SignaturePad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  type HomeAddress,
  type Purpose,
  type TermsAnswers,
} from "@/lib/stay-terms";
import { phoneCountries } from "@/lib/world";

/** The text exactly as the server rendered it (and will keep). */
function TermsText({ text, label }: { text: string; label: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <section
      aria-label={label}
      tabIndex={0}
      className="max-h-[50dvh] overflow-y-auto rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed [&_h2]:text-xl [&_h3]:mt-4 [&_h3]:text-base [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2"
    >
      <AgreementBlocks blocks={blocks} />
    </section>
  );
}

/** A full text folded under one line, opened to read. */
function ReadFull({ title, text }: { title: string; text: string }) {
  return (
    <details className="group rounded-2xl border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {copy.readFull(title)}
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3">
        <TermsText text={text} label={title} />
      </div>
    </details>
  );
}

const setTick = (value: TermsAnswers, t: string, on: boolean): TermsAnswers => ({
  ...value,
  ticks: on ? [...new Set([...value.ticks, t])] : value.ticks.filter((x) => x !== t),
});

/**
 * A shorter stay: one unticked box beside a link that opens the booking
 * terms and house rules in full.
 */
export function ShortStayTerms({
  termsText,
  value,
  onChange,
}: {
  termsText: string;
  value: TermsAnswers;
  onChange: (v: TermsAnswers) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-muted p-3 text-sm">
      <Checkbox
        id="terms-tick"
        checked={value.ticks.includes("terms")}
        onCheckedChange={(v) => onChange(setTick(value, "terms", v === true))}
        className="mt-0.5"
      />
      <span>
        <label htmlFor="terms-tick">{copy.agreeBefore}</label>{" "}
        <button
          type="button"
          className="font-medium underline underline-offset-2"
          onClick={() => setOpen(true)}
        >
          {copy.termsLink}
        </button>{" "}
        <label htmlFor="terms-tick">{copy.agreeAfter}</label>
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] max-w-2xl grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{copy.termsTitle}</DialogTitle>
          </DialogHeader>
          <TermsText text={termsText} label={copy.termsTitle} />
          <Button
            type="button"
            size="lg"
            onClick={() => {
              onChange(setTick(value, "terms", true));
              setOpen(false);
            }}
          >
            {copy.agreeTerms}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Everything a longer stay signs, in order: the key points, the home address
 * and purpose, the full texts folded, one confirmation, the typed name and a
 * drawn signature. Used in the booking page's dialog and on /agree/<token>.
 */
export function LongStaySign({
  termsText,
  licenceText,
  keyPoints,
  value,
  onChange,
}: {
  termsText: string;
  licenceText: string;
  keyPoints: string[];
  value: TermsAnswers;
  onChange: (v: TermsAnswers) => void;
}) {
  const countries = useMemo(() => phoneCountries(), []);
  const addr = (k: keyof HomeAddress, v: string) =>
    onChange({ ...value, homeAddress: { ...value.homeAddress, [k]: v } });
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl bg-muted p-4">
        <p className="font-medium">{copy.keyPoints}</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {keyPoints.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ol>
      </div>
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
      <div className="space-y-2">
        <ReadFull title={copy.licenceTitle} text={licenceText} />
        <ReadFull title={copy.termsTitle} text={termsText} />
      </div>
      <label className="flex items-start gap-3 rounded-2xl border-2 border-primary/40 p-3 text-sm">
        <Checkbox
          checked={value.ticks.includes("agree_all")}
          onCheckedChange={(v) => onChange(setTick(value, "agree_all", v === true))}
          className="mt-0.5"
        />
        <span className="font-medium">{TICK_TEXT.agree_all}</span>
      </label>
      <div className="space-y-1">
        <Label htmlFor="typed-name">{copy.typedName}</Label>
        <Input
          id="typed-name"
          autoComplete="name"
          value={value.typedName}
          onChange={(e) => onChange({ ...value, typedName: e.target.value })}
        />
      </div>
      {value.signature ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy.signature}</p>
          <img
            src={value.signature}
            alt={copy.signedAlt}
            className="h-28 w-full rounded-2xl border border-border bg-white object-contain"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...value, signature: null })}
          >
            <PenLine /> {copy.signAgain}
          </Button>
        </div>
      ) : (
        <SignaturePad
          label={copy.signature}
          onChange={(signature) => onChange({ ...value, signature })}
        />
      )}
      <p className="text-xs text-muted-foreground">{copy.kept}</p>
    </div>
  );
}

/**
 * The booking page's longer stay: a short card on the page (what's needed,
 * signed or not), and the signing in a dialog whose button agrees and goes
 * straight on to book and pay. Booking only happens from that button.
 */
export function LongStayCard({
  termsText,
  licenceText,
  keyPoints,
  nights,
  value,
  onChange,
  open,
  onOpenChange,
  signed,
  action,
  busy,
  error,
  onAgree,
}: {
  termsText: string;
  licenceText: string;
  keyPoints: string[];
  nights: number;
  value: TermsAnswers;
  onChange: (v: TermsAnswers) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Signed for the stay as it stands now. */
  signed: boolean;
  /** The dialog's button, e.g. "Agree and continue to pay £2,240.00". */
  action: string;
  busy: boolean;
  error: string | null;
  onAgree: () => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <div className="flex items-start gap-3">
        {signed ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        ) : (
          <FileSignature className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{copy.licenceTitle}</p>
          <p className="text-sm text-muted-foreground">
            {signed ? copy.signedBy(value.typedName.trim()) : copy.longIntro(nights)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(true)}>
          {signed ? copy.review : copy.readAndSign}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="max-h-[92dvh] max-w-2xl grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{copy.licenceTitle}</DialogTitle>
            <DialogDescription>{copy.licenceIntro}</DialogDescription>
          </DialogHeader>
          <LongStaySign
            termsText={termsText}
            licenceText={licenceText}
            keyPoints={keyPoints}
            value={value}
            onChange={onChange}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="button" size="lg" disabled={busy} onClick={onAgree}>
            {busy ? <Loader2 className="animate-spin" /> : <FileSignature />} {action}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
