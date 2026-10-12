import { useState } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, CalendarDays, Eye, History, Home, Loader2, LogOut, Mail, NotebookPen, Plug, Settings, Sun, Wrench, type LucideIcon } from "lucide-react";

import { HostInbox } from "@/components/host/HostInbox";
import { HostSwitcher, useAccessWatch } from "@/components/host/HostSwitcher";
import { LogoMark } from "@/components/theme/LogoMark";

import { ThemeScope } from "@/components/theme/ThemeScope";
import { Button } from "@/components/ui/button";
import { auth, brand, hostNav, invite as inviteCopy, team as teamCopy } from "@/content/copy";
import { useAlerts, useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { getWorkspace } from "@/lib/host.functions";
import { DEMO_EMAIL, signOut } from "@/lib/demo-session";
import { normaliseTheme } from "@/lib/theme";

type NavItem = { to: string; label: string; icon: LucideIcon };

const navItems: NavItem[] = [
  { to: "/app/today", label: hostNav.today, icon: Sun },
  { to: "/app/bookings", label: hostNav.bookings, icon: CalendarDays },
  { to: "/app/services", label: hostNav.services, icon: Wrench },
  { to: "/app/guides", label: hostNav.guides, icon: BookOpen },
  { to: "/app/properties", label: hostNav.properties, icon: Home },
  { to: "/app/connections", label: hostNav.connections, icon: Plug },
  { to: "/app/settings", label: hostNav.settings, icon: Settings },
];

function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
}

export function HostShell() {
  const navigate = useNavigate();
  const alertCount = useAlerts().data?.alerts.length ?? 0;
  const { data } = useWorkspace();
  const { canWrite, isOwner } = useRole();
  useAccessWatch();
  const properties = (data?.properties ?? []) as Array<{ id: string; name: string; theme_config: unknown }>;
  const { selectedId } = useSelectedProperty(properties);
  const property = properties.find((p) => p.id === selectedId) ?? null;
  const theme = normaliseTheme(property?.theme_config);
  const host = data?.host as { business_name?: string } | null | undefined;
  const title = property?.name ?? host?.business_name ?? brand.name;

  async function leave() {
    await signOut();
    await navigate({ to: "/auth" });
  }

  if (data?.pendingInvite) return <PendingInvite onSignOut={() => void leave()} />;

  const readOnly = data && !canWrite ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
      <Eye className="size-3.5" /> {teamCopy.readOnlyBadge}
    </span>
  ) : null;

  return (
    <ThemeScope theme={theme} global className="min-h-screen">
      {/* Desktop: floating frosted sidebar */}
      <aside className="glass fixed inset-y-4 left-4 z-20 hidden w-64 flex-col rounded-[2rem] p-4 md:flex print:hidden">
        <Link to="/" className="flex items-center gap-3 rounded-2xl px-2 py-2">
          <LogoMark theme={theme} name={title} />
          <span className="min-w-0">
            <span className="block truncate font-display text-lg leading-tight">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{brand.name}</span>
          </span>
        </Link>

        <HostSwitcher className="mt-3 h-10 rounded-2xl" />
        {readOnly ? <div className="mt-3 px-2">{readOnly}</div> : null}

        <nav className="mt-6 flex flex-col gap-1" aria-label="Main">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={haptic}
              className="spring flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-[0.97]"
              activeProps={{ className: "bg-primary !text-primary-foreground shadow-soft", "aria-current": "page" }}
            >
              <Icon className="size-5 shrink-0" />
              <span className="truncate">{label}</span>
              {to === "/app/today" && alertCount > 0 ? (
                <span className="ml-auto rounded-full bg-destructive px-2 text-xs text-destructive-foreground" aria-label={`${alertCount} alerts`}>
                  {alertCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        {canWrite ? (
          <Link
            to="/app/register"
            onClick={haptic}
            className="spring mt-auto flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "bg-primary !text-primary-foreground shadow-soft", "aria-current": "page" }}
          >
            <NotebookPen className="size-5" />
            {hostNav.register}
          </Link>
        ) : null}
        {isOwner ? (
          <Link
            to="/app/activity"
            onClick={haptic}
            className="spring flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "bg-primary !text-primary-foreground shadow-soft", "aria-current": "page" }}
          >
            <History className="size-5" />
            {hostNav.activity}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={leave}
          className={`spring ${canWrite ? "" : "mt-auto "}flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground`}
        >
          <LogOut className="size-5" />
          {auth.signOut}
        </button>
      </aside>

      {(host as { contact_email?: string } | null | undefined)?.contact_email === DEMO_EMAIL ? (
        <button
          type="button"
          onClick={() => void leave()}
          className="fixed bottom-24 right-4 z-40 h-12 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:bottom-6 md:right-6 print:hidden"
        >
          Start your free trial
        </button>
      ) : null}

      {/* Desktop: messages sit top right, away from the sidebar */}
      <div className="glass fixed right-6 top-6 z-30 hidden rounded-2xl p-1 md:block print:hidden">
        <HostInbox propertyId={selectedId ?? null} />
      </div>

      {/* Phone/tablet portrait: compact glass header */}
      <header className="glass sticky top-2 z-10 mx-3 mt-2 flex items-center gap-1 rounded-2xl px-3 py-2 md:hidden print:hidden">
        <LogoMark theme={theme} name={title} className="size-9" />
        <span className="min-w-0 flex-1 truncate font-display text-lg">{title}</span>
        <HostInbox propertyId={selectedId ?? null} />
        <button
          type="button"
          onClick={leave}
          aria-label={auth.signOut}
          className="grid size-11 place-items-center rounded-xl text-muted-foreground"
        >
          <LogOut className="size-5" />
        </button>
      </header>
      {(data?.memberships.length ?? 0) > 1 || readOnly ? (
        <div className="mx-3 mt-2 flex items-center gap-2 md:hidden print:hidden">
          <HostSwitcher className="h-10 flex-1 rounded-2xl" />
          {readOnly}
        </div>
      ) : null}

      <main className="px-4 py-6 pb-32 sm:px-6 md:ml-72 md:py-10 md:pb-10">
        <Outlet />
      </main>


      {/* Floating pill dock */}
      <nav
        aria-label="Main"
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto grid max-w-2xl grid-cols-7 gap-1 rounded-[1.75rem] p-1.5 md:hidden print:hidden"
      >
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={haptic}
            className="spring flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 text-[10px] font-medium text-muted-foreground active:scale-90"
            activeProps={{ className: "bg-primary !text-primary-foreground shadow-soft", "aria-current": "page" }}
          >
            <span className="relative">
              <Icon className="size-5" />
              {to === "/app/today" && alertCount > 0 ? (
                <span className="absolute -right-2 -top-1 size-2.5 rounded-full bg-destructive ring-2 ring-surface" aria-label={`${alertCount} alerts`} />
              ) : null}
            </span>
            <span className="max-w-full truncate">{label}</span>
          </Link>
        ))}
      </nav>
    </ThemeScope>
  );
}

/** Signed in, no workspace yet, and an invitation is waiting for this email. */
function PendingInvite({ onSignOut }: { onSignOut: () => void }) {
  const fetchWorkspace = useServerFn(getWorkspace);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card-soft max-w-md space-y-4 p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
          <Mail className="size-7" />
        </span>
        <h1 className="text-2xl">{inviteCopy.pendingTitle}</h1>
        <p className="text-muted-foreground">{inviteCopy.pendingBody}</p>
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const ws = await fetchWorkspace({ data: { create: true } });
              qc.setQueryData(["workspace"], ws);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {inviteCopy.pendingOwn}
        </Button>
        <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={onSignOut}>
          {auth.signOut}
        </button>
      </div>
    </main>
  );
}
