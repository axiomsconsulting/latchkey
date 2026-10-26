import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";

import { SiteHeader } from "@/components/SiteHeader";
import { PhoneInput } from "@/components/WorldPickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { partnerCopy as copy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { deviceId } from "@/lib/attribution";
import { markPartnerIntent } from "@/lib/partner-intent";
import { rebrand } from "@/lib/brand";
import { applyAsPartner } from "@/lib/partners.functions";
import { phoneCountries } from "@/lib/world";

/** Public page: what being an independent Latchkey Commission Partner means, and the application form once signed in. */
export const Route = createFileRoute("/partners/join")({
  head: () => ({
    meta: [
      { title: rebrand("Commission Partners · Latchkey") },
      {
        name: "description",
        content: rebrand(
          "Introduce hosts to Latchkey and earn commission as an independent Commission Partner.",
        ),
      },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const [user, setUser] = useState<{ email: string | null; anonymous: boolean } | null | undefined>(
    undefined,
  );
  useEffect(() => {
    void supabase.auth
      .getUser()
      .then(({ data }) =>
        setUser(
          data.user
            ? { email: data.user.email ?? null, anonymous: !!data.user.is_anonymous }
            : null,
        ),
      );
  }, []);
  const signedIn = !!user && !user.anonymous;
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-5 pb-32 pt-4 md:pb-16">
        <header className="space-y-3">
          <h1 className="text-4xl">{copy.joinTitle}</h1>
          <p className="text-lg text-muted-foreground">{copy.joinIntro}</p>
        </header>
        <ul className="card-soft grid gap-3 p-5">
          {copy.joinPoints.map((p: string) => (
            <li key={p} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" /> {p}
            </li>
          ))}
          <li className="text-sm text-muted-foreground">{copy.joinTermsNote}</li>
        </ul>
        {user === undefined ? null : signedIn ? (
          <ApplyForm email={user.email ?? ""} />
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link
                to="/auth"
                search={{ mode: "sign_up", next: "/partners/join", for: "partner" }}
                onClick={markPartnerIntent}
              >
                {copy.joinSignUp}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link
                to="/auth"
                search={{ next: "/partners/join", for: "partner" }}
                onClick={markPartnerIntent}
              >
                {copy.joinSignIn}
              </Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function ApplyForm({ email: startEmail }: { email: string }) {
  const apply = useServerFn(applyAsPartner);
  const navigate = useNavigate();
  const countries = useMemo(() => phoneCountries(), []);
  const [kind, setKind] = useState<"individual" | "business">("individual");
  const [f, setF] = useState({
    legalName: "",
    businessName: "",
    businessType: "",
    companyNumber: "",
    country: "GB",
    email: startEmail,
    vat: "",
  });
  const [phone, setPhone] = useState({
    country: "GB",
    national: "",
    valid: false,
    e164: null as string | null,
  });
  const [acks, setAcks] = useState({ tax: false, independent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const ready =
    f.legalName.trim().length > 1 &&
    f.email.includes("@") &&
    phone.e164 &&
    acks.tax &&
    acks.independent &&
    (kind === "individual" || f.businessName.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await apply({
        data: {
          kind,
          legalName: f.legalName,
          businessName: f.businessName || undefined,
          businessType: f.businessType || undefined,
          companyNumber: f.companyNumber || undefined,
          country: f.country,
          email: f.email,
          phone: phone.e164 ?? "",
          vatNumber: f.vat || undefined,
          taxAck: true,
          independentAck: true,
          deviceId: deviceId(),
        },
      });
      await navigate({ to: "/partners" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-soft grid gap-4 p-5">
      <h2 className="text-xl">{copy.formTitle}</h2>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {(["individual", "business"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-xl border px-4 py-2 text-sm ${kind === k ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
          >
            {k === "individual" ? copy.kindIndividual : copy.kindBusiness}
          </button>
        ))}
      </div>
      <Field id="legal" label={copy.legalName}>
        <Input
          id="legal"
          className="h-12"
          value={f.legalName}
          onChange={set("legalName")}
          autoComplete="name"
          required
        />
      </Field>
      {kind === "business" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="biz" label={copy.businessName}>
            <Input
              id="biz"
              className="h-12"
              value={f.businessName}
              onChange={set("businessName")}
              autoComplete="organization"
            />
          </Field>
          <Field id="biztype" label={copy.businessType}>
            <Input
              id="biztype"
              className="h-12"
              value={f.businessType}
              onChange={set("businessType")}
            />
          </Field>
          <Field id="company" label={copy.companyNumber}>
            <Input
              id="company"
              className="h-12"
              value={f.companyNumber}
              onChange={set("companyNumber")}
            />
          </Field>
          <Field id="vat" label={copy.vat}>
            <Input id="vat" className="h-12" value={f.vat} onChange={set("vat")} />
          </Field>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="country" label={copy.country}>
          <select
            id="country"
            className="h-12 w-full rounded-xl border border-input bg-background px-3"
            value={f.country}
            onChange={set("country")}
          >
            {countries.map((c) => (
              <option key={c.iso} value={c.iso}>{`${c.flag} ${c.name}`}</option>
            ))}
          </select>
        </Field>
        <Field id="email" label={copy.email}>
          <Input
            id="email"
            type="email"
            className="h-12"
            value={f.email}
            onChange={set("email")}
            autoComplete="email"
            required
          />
        </Field>
      </div>
      <Field id="phone" label={copy.phone}>
        <PhoneInput
          id="phone"
          country={phone.country}
          national={phone.national}
          onChange={setPhone}
        />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={acks.tax}
          onCheckedChange={(v) => setAcks((a) => ({ ...a, tax: v === true }))}
          className="mt-0.5"
        />{" "}
        {copy.taxAck}
      </label>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={acks.independent}
          onCheckedChange={(v) => setAcks((a) => ({ ...a, independent: v === true }))}
          className="mt-0.5"
        />{" "}
        {copy.independentAck}
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={!ready || busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : copy.apply}
      </Button>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
