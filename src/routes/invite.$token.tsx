import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { Button } from "@/components/ui/button";
import { invite as copy, team as teamCopy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_EMAIL } from "@/lib/demo-account";
import { maskEmail } from "@/lib/roles";
import { acceptInvite, peekInvite } from "@/lib/team.functions";

export const Route = createFileRoute("/invite/$token")({
  loader: ({ params }) => peekInvite({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Team invitation — Latchkey" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.missing} />
    </GuestFrame>
  ),
  component: InvitePage,
});

/** Same shape as the masked address, so we can tell if a signed-in email could match. */
function couldMatch(masked: string, email: string): boolean {
  return maskEmail(email) === masked;
}

function InvitePage() {
  const peek = Route.useLoaderData();
  const { token } = Route.useParams();
  const accept = useServerFn(acceptInvite);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  if (!peek.found) {
    return (
      <GuestFrame>
        <GuestMessage text={copy.missing} />
      </GuestFrame>
    );
  }
  if (peek.status !== "open") {
    return (
      <GuestFrame>
        <GuestMessage text={copy[peek.status]} />
      </GuestFrame>
    );
  }

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await accept({ data: { token } });
      await qc.resetQueries();
      await navigate({ to: "/app/today" });
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.missing);
    } finally {
      setBusy(false);
    }
  }

  const roleName = teamCopy.roles[peek.role];
  const isDemo = email === DEMO_EMAIL;
  const wrongEmail = !!email && !isDemo && !couldMatch(peek.emailMasked, email);

  return (
    <GuestFrame>
      <main className="mx-auto max-w-lg py-12">
        <div className="card-soft space-y-5 p-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
            <Users className="size-7" />
          </span>
          <h1 className="text-3xl">{copy.title(peek.hostName)}</h1>
          <p className="text-lg">{copy.as(roleName)}</p>
          <p className="text-muted-foreground">{teamCopy.roleHints[peek.role]}</p>

          {email === undefined ? (
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          ) : isDemo ? (
            <p role="alert" className="text-destructive">{copy.demo}</p>
          ) : email === null ? (
            <>
              <p className="text-muted-foreground">{copy.signInFirst(peek.emailMasked)}</p>
              <Button asChild size="lg" className="w-full">
                <Link to="/auth" search={{ next: `/invite/${token}` }}>
                  {copy.signIn}
                </Link>
              </Button>
            </>
          ) : wrongEmail ? (
            <p role="alert" className="text-destructive">{copy.wrongEmail(peek.emailMasked)}</p>
          ) : (
            <Button size="lg" className="w-full" disabled={busy} onClick={() => void join()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? copy.accepting : copy.accept}
            </Button>
          )}
          {error ? <p role="alert" className="text-destructive">{error}</p> : null}
        </div>
      </main>
    </GuestFrame>
  );
}
