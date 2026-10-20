import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth as copy, brand } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_EMAIL, markDemo, signOut } from "@/lib/demo-session";
import { LastUsed, SocialButtons } from "@/components/SocialButtons";
import { authExtraCopy as extra } from "@/content/copy";
import { lastSignIn, signInIntent, type SignInMethod } from "@/lib/social-auth";
import { lastHost } from "@/lib/last-host";
import { SiteLogoMark } from "@/components/brand/BrandLogo";
import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { rebrand } from "@/lib/brand";

/** Only same-site paths, so a crafted link can't send people elsewhere. */
function safeNext(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { next?: string; email?: string; mode?: "sign_up" } => {
    const next = safeNext(search["next"]);
    const email = typeof search["email"] === "string" ? search["email"].slice(0, 254) : undefined;
    return {
      ...(next ? { next } : {}),
      ...(email ? { email } : {}),
      ...(search["mode"] === "sign_up" ? { mode: "sign_up" as const } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: rebrand("Host sign in — Latchkey") },
      {
        name: "description",
        content: rebrand("Sign in to manage arrivals, rooms and booking calendars in Latchkey."),
      },
      { property: "og:title", content: rebrand("Host sign in — Latchkey") },
      {
        property: "og:description",
        content: rebrand("Sign in to manage arrivals, rooms and booking calendars in Latchkey."),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  // Where to go after signing in, e.g. back to an invitation link.
  const next = search.next ?? "/app/today";
  const [mode, setMode] = useState<"sign_in" | "sign_up">(search.mode ?? "sign_in");
  const [email, setEmail] = useState(search.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // How this device signed in last time: badge it, and fill in the email.
  const [last, setLast] = useState<SignInMethod | null>(null);
  // Folded until chosen; open straight away when a link brought their email.
  const [emailOpen, setEmailOpen] = useState(!!search.email);
  // Someone who has signed in on this device before: show their business's own logo.
  const [known, setKnown] = useState<ReturnType<typeof lastHost>>(null);
  useEffect(() => {
    const l = lastSignIn();
    setLast(l?.method ?? null);
    if (l) setKnown(lastHost());
    if (l?.email && !search.email) setEmail((e) => e || l.email!);
  }, [search.email]);

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      // A free trial in progress can sign in to a saved account from here.
      if (data.session.user.is_anonymous) return;
      // Shared demo session: drop it so visitors can register their own account.
      if (data.session.user.email === DEMO_EMAIL) {
        await signOut();
        setMode("sign_up");
        return;
      }
      void navigate({ href: next });
    });
  }, [navigate, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "sign_up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${next}` },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success(copy.checkInbox);
          return;
        }
      } else {
        signInIntent("password");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // A real account from here on: never fall back to the demo when it expires.
      markDemo(false);
      await navigate({ href: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function sendLink() {
    if (!email.trim()) {
      toast.error(copy.magicNeedsEmail);
      return;
    }
    setBusy(true);
    try {
      // Existing accounts only: new hosts start from the free trial instead.
      signInIntent("email_link");
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}${next}` },
      });
      if (error) throw error;
      markDemo(false);
      toast.success(copy.magicSent(email.trim()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-3">
          {known ? (
            // A returning host on this device: their own logo and name.
            <ThemeScope theme={known.theme} className="bg-transparent">
              <span className="flex items-center gap-3">
                <LogoMark theme={known.theme} name={known.name} />
                <span className="font-display text-xl">{known.name}</span>
              </span>
            </ThemeScope>
          ) : (
            <>
              <SiteLogoMark className="size-11" />
              <span className="font-display text-xl">{brand.name}</span>
            </>
          )}
        </Link>

        <Card className="card-soft">
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              {mode === "sign_in" ? copy.signInTitle : copy.signUpTitle}
            </CardTitle>
            <CardDescription>
              {mode === "sign_in" ? copy.signInBody : copy.signUpBody}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SocialButtons next={next} signUp={mode === "sign_up"} />

            {/* Email is one more option, folded until chosen. */}
            {!emailOpen ? (
              <div className="relative mt-2">
                <Button type="button" variant="outline" size="lg" className="h-12 w-full gap-3 text-base" onClick={() => setEmailOpen(true)}>
                  <Mail className="size-5" /> {mode === "sign_in" ? extra.email : extra.emailSignUp}
                </Button>
                {mode === "sign_in" && (last === "password" || last === "email_link") ? <LastUsed method={last} current={last} /> : null}
              </div>
            ) : (
              <>
                <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {extra.orEmail}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{copy.emailLabel}</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{copy.passwordLabel}</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <div className="relative">
                    <Button type="submit" className="w-full" size="lg" disabled={busy}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      {mode === "sign_in" ? copy.signInCta : copy.signUpCta}
                    </Button>
                    {mode === "sign_in" ? <LastUsed method="password" current={last} /> : null}
                  </div>
                </form>

                {mode === "sign_in" ? (
                  <>
                    <div className="relative mt-3">
                      <Button type="button" variant="outline" className="w-full" size="lg" disabled={busy} onClick={() => void sendLink()}>
                        <Sparkles className="size-4" /> {copy.magicCta}
                      </Button>
                      <LastUsed method="email_link" current={last} />
                    </div>
                    <p className="mt-2 text-center text-xs text-muted-foreground">{extra.magicNoPassword}</p>
                  </>
                ) : null}
              </>
            )}

            <button
              type="button"
              className="mt-5 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
              // New hosts go straight into the guided trial (no form, no password);
              // the sign-up form is only the fallback when trials can't start anonymously.
              onClick={() => (mode === "sign_in" ? void navigate({ to: "/start" }) : setMode("sign_in"))}
            >
              {mode === "sign_in" ? copy.switchToSignUp : copy.switchToSignIn}
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
