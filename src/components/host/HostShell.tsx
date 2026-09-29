import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Home, LogOut, Plug, Settings, Sun, Wrench, type LucideIcon } from "lucide-react";

import { LogoMark } from "@/components/theme/LogoMark";
import { ThemeScope } from "@/components/theme/ThemeScope";
import { auth, brand, hostNav } from "@/content/copy";
import { useAlerts, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { supabase } from "@/integrations/supabase/client";
import { normaliseTheme } from "@/lib/theme";

type NavItem = { to: string; label: string; icon: LucideIcon };

const navItems: NavItem[] = [
  { to: "/app/today", label: hostNav.today, icon: Sun },
  { to: "/app/bookings", label: hostNav.bookings, icon: CalendarDays },
  { to: "/app/services", label: hostNav.services, icon: Wrench },
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
  const properties = (data?.properties ?? []) as Array<{ id: string; name: string; theme_config: unknown }>;
  const { selectedId } = useSelectedProperty(properties);
  const property = properties.find((p) => p.id === selectedId) ?? null;
  const theme = normaliseTheme(property?.theme_config);
  const host = data?.host as { business_name?: string } | null | undefined;
  const title = property?.name ?? host?.business_name ?? brand.name;

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  return (
    <ThemeScope theme={theme} className="min-h-screen">
      {/* Desktop: floating frosted sidebar */}
      <aside className="glass fixed inset-y-4 left-4 z-20 hidden w-64 flex-col rounded-[2rem] p-4 md:flex print:hidden">
        <Link to="/" className="flex items-center gap-3 rounded-2xl px-2 py-2">
          <LogoMark theme={theme} name={title} />
          <span className="min-w-0">
            <span className="block truncate font-display text-lg leading-tight">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{brand.name}</span>
          </span>
        </Link>

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

        <button
          type="button"
          onClick={signOut}
          className="spring mt-auto flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="size-5" />
          {auth.signOut}
        </button>
      </aside>

      {/* Phone/tablet portrait: compact glass header */}
      <header className="glass sticky top-2 z-10 mx-3 mt-2 flex items-center gap-3 rounded-2xl px-3 py-2 md:hidden print:hidden">
        <LogoMark theme={theme} name={title} className="size-9" />
        <span className="min-w-0 flex-1 truncate font-display text-lg">{title}</span>
        <button
          type="button"
          onClick={signOut}
          aria-label={auth.signOut}
          className="grid size-11 place-items-center rounded-xl text-muted-foreground"
        >
          <LogOut className="size-5" />
        </button>
      </header>

      <main className="px-4 py-6 pb-32 sm:px-6 md:ml-72 md:py-10 md:pb-10">
        <Outlet />
      </main>

      {/* Floating pill dock */}
      <nav
        aria-label="Main"
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto grid max-w-xl grid-cols-6 gap-1 rounded-[1.75rem] p-1.5 md:hidden print:hidden"
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
