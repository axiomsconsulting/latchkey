import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Send } from "lucide-react";

import { PhoneInput } from "@/components/WorldPickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bookPageCopy as copy, enquiryCopy } from "@/content/copy";
import { formatUkDate, nightsBetween } from "@/lib/dates";
import { enquiryConsentText, enquiryProblem } from "@/lib/direct";
import { partyText } from "@/lib/direct-booking";
import { submitEnquiry } from "@/lib/direct.functions";

export type Contact = { name: string; email: string; phoneCountry: string; phoneNational: string; phone: string | null };

export const emptyContact = (country: string): Contact => ({ name: "", email: "", phoneCountry: country, phoneNational: "", phone: null });

/** Name, email and phone: all three needed, so the host can reply either way. */
export function ContactFields({ value, onChange, idPrefix }: { value: Contact; onChange: (c: Contact) => void; idPrefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>{copy.name}</Label>
        <Input id={`${idPrefix}-name`} className="h-12" autoComplete="name" maxLength={120} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-email`}>{copy.email}</Label>
        <Input id={`${idPrefix}-email`} type="email" className="h-12" autoComplete="email" maxLength={254} value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} required />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-phone`}>{copy.phone}</Label>
        <PhoneInput
          id={`${idPrefix}-phone`}
          country={value.phoneCountry}
          national={value.phoneNational}
          onChange={(p) => onChange({ ...value, phoneCountry: p.country, phoneNational: p.national, phone: p.e164 })}
        />
      </div>
    </div>
  );
}

/**
 * Asking about a room (or the property) for the dates and party already
 * chosen on the page, in a box over the page: contact details, a message,
 * consent to be contacted about it, and the separate, optional future-stays
 * consent. Nothing is booked.
 */
export function EnquiryDialog({
  open,
  onOpenChange,
  code,
  business,
  consent,
  today,
  room,
  checkIn,
  checkOut,
  adults,
  children,
  estimate,
  contact,
  onContact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  business: string;
  consent: string;
  today: string;
  room: { id: string; name: string } | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  estimate: string | null;
  contact: Contact;
  onContact: (c: Contact) => void;
}) {
  const send = useServerFn(submitEnquiry);
  const [message, setMessage] = useState("");
  const [agree, setAgree] = useState(false);
  const [futureStays, setFutureStays] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (open) {
      setSent(false);
      setError(null);
    }
  }, [open, room?.id]);
  const guests = adults + children;
  const nights = nightsBetween(checkIn, checkOut);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem =
      enquiryProblem({ name: contact.name, email: contact.email, phone: contact.phone, checkIn, checkOut, guests, message }, today) ?? (agree ? null : enquiryCopy.agreeNeeded);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await send({
        data: { code, name: contact.name, email: contact.email, phone: contact.phone, checkIn, checkOut, guests, children, message: message || null, futureStays, roomId: room?.id ?? null, website },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : enquiryCopy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {sent ? (
          <div className="space-y-3 py-4 text-center" role="status">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-7" />
            </span>
            <DialogTitle className="text-2xl">{enquiryCopy.sentTitle}</DialogTitle>
            <DialogDescription>{enquiryCopy.sentBody(business)}</DialogDescription>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{copy.close}</Button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle className="text-2xl">{room ? copy.enquireAbout(room.name) : copy.askQuestion}</DialogTitle>
              <DialogDescription>
                {copy.enquirySummary(formatUkDate(checkIn), formatUkDate(checkOut), nights, partyText(adults, children))}
                {estimate ? ` · ${enquiryCopy.estimate(estimate)}` : ""}
              </DialogDescription>
            </DialogHeader>
            <ContactFields value={contact} onChange={onContact} idPrefix="enq" />
            <div className="space-y-1">
              <Label htmlFor="enq-msg">{enquiryCopy.message}</Label>
              <Textarea id="enq-msg" rows={3} maxLength={2000} placeholder={enquiryCopy.messagePlaceholder} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {/* Hidden from people; bots fill it in. */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>
            <label className="flex items-start gap-3 rounded-2xl bg-muted p-3 text-sm">
              <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
              <span>{enquiryConsentText(business)}</span>
            </label>
            {/* Separate, unticked, and optional: future stays. */}
            <label className="flex items-start gap-3 rounded-2xl border border-border p-3 text-sm">
              <Checkbox checked={futureStays} onCheckedChange={(v) => setFutureStays(v === true)} className="mt-0.5" />
              <span>
                {consent} <span className="text-muted-foreground">{enquiryCopy.optional}</span>
              </span>
            </label>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} {enquiryCopy.send}
            </Button>
            <p className="text-xs text-muted-foreground">{enquiryCopy.notBooked}</p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
