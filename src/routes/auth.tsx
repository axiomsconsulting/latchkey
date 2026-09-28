import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth as copy, brand } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Host sign in — Latchkey" },
      {
        name: "description",
        content: "Sign in to manage arrivals, rooms and booking calendars in Latchkey.",
      },
      { property: "og:title", content: "Host sign in — Latchkey" },
      {
        property: "og:description",
        content: "Sign in to manage arrivals, rooms and booking calendars in Latchkey.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/app/today" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "sign_up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/app/today` },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success(copy.checkInbox);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await navigate({ to: "/app/today" });
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
          <span className="grid size-10 place-items-center rounded-2xl bg-primary font-display text-lg text-primary-foreground">
            L
          </span>
          <span className="font-display text-xl">{brand.name}</span>
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
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{copy.emailLabel}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
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
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {mode === "sign_in" ? copy.signInCta : copy.signUpCta}
              </Button>
            </form>

            <button
              type="button"
              className="mt-5 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
            >
              {mode === "sign_in" ? copy.switchToSignUp : copy.switchToSignIn}
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
