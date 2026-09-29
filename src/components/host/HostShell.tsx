import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Home, LogOut, Plug, Settings, Sun, type LucideIcon } from "lucide-react";

import { auth, brand, hostNav } from "@/content/copy";
import { useAlerts, useWorkspace } from "@/hooks/use-host-data";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon };

const navItems: NavItem[] = [
  { to: "/app/today", label: hostNav.today, icon: Sun },
  { to: "/app/bookings", label: hostNav.bookings, icon: CalendarDays },
  { to: "/app/properties", label: hostNav.properties, icon: Home },
  { to: "/app/connections", label: hostNav.connections, icon: Plug },
  { to: "/app/settings", label: hostNav.settings, icon: Settings },
];

export function HostShell() {
  const navigate = useNavigate();
  const alertCount = useAlerts().data?.alerts.length ?? 0;
  const { data } = useWorkspace();
  const host = data?.host as { business_name?: string } | null | undefined;
  const businessName = host?.business_name ?? "";

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-sidebar p-5 text-sidebar-foreground md:flex print:hidden">
        <Link to="/" className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid size-10 place-items-center rounded-2xl bg-sidebar-primary font-display text-lg text-sidebar-primary-foreground">
            L
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight">{brand.name}</span>
            <span className="block truncate text-xs text-sidebar-foreground/70">
              {businessName || brand.tagline}
            </span>
          </span>
        </Link>

        <nav className="mt-8 flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground",
                "aria-current": "page",
              }}
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

        <button
          type="button"
          onClick={signOut}
          className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-5" />
          {auth.signOut}
        </button>
      </aside>

      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-4 py-3 md:hidden print:hidden">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-display text-primary-foreground">
          L
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-lg">
          {businessName || brand.name}
        </span>
        <button
          type="button"
          onClick={signOut}
          aria-label={auth.signOut}
          className="grid size-10 place-items-center rounded-xl text-muted-foreground"
        >
          <LogOut className="size-5" />
        </button>
      </header>

      <main className={cn("px-4 py-6 pb-28 sm:px-6", "md:ml-64 md:py-10 md:pb-10")}>
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-muted-foreground"
            activeProps={{ className: "text-primary", "aria-current": "page" }}
          >
            <span className="relative">
              <Icon className="size-5" />
              {to === "/app/today" && alertCount > 0 ? (
                <span className="absolute -right-2 -top-1 size-2.5 rounded-full bg-destructive" aria-label={`${alertCount} alerts`} />
              ) : null}
            </span>
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
