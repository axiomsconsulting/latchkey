import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  CalendarDays,
  Eye,
  History,
  Home,
  Loader2,
  LogOut,
  Mail,
  NotebookPen,
  PanelLeftOpen,
  Plug,
  Settings,
  Sun,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { HostInbox } from "@/components/host/HostInbox";
import { HostSwitcher, useAccessWatch } from "@/components/host/HostSwitcher";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import { TrialBanner } from "@/components/host/TrialBanner";
import { UserChip } from "@/components/host/UserChip";
import { LogoMark } from "@/components/theme/LogoMark";

import { ThemeScope } from "@/components/theme/ThemeScope";
import { Button } from "@/components/ui/button";
import { auth, brand, hostNav, invite as inviteCopy, siteMenu, team as teamCopy } from "@/content/copy";
import { useAlerts, useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { getWorkspace } from "@/lib/host.functions";
import { DEMO_EMAIL, signOut } from "@/lib/demo-session";
import { NAV_WIDTH, cycleMode, modeForWidth, readNavMode, stepMode, type NavMode } from "@/lib/nav-mode";
import { normaliseTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; short: string; icon: LucideIcon };

const item = (to: string, key: keyof typeof hostNav & string, icon: LucideIcon): NavItem => ({
  to,
  label: hostNav[key] as string,
  short: hostNav.short[key] ?? (hostNav[key] as string),
  icon,
});

const navItems: NavItem[] = [
  item("/app/today", "today", Sun),
  item("/app/bookings", "bookings", CalendarDays),
  item("/app/services", "services", Wrench),
  item("/app/guides", "guides", BookOpen),
  item("/app/properties", "properties", Home),
  item("/app/connections", "connections", Plug),
  item("/app/settings", "settings", Settings),
];

const NAV_KEY = "latchkey.nav";

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
  const { selectedId, select } = useSelectedProperty(properties);
  const switcher = (className: string) => (
    <PropertyPicker properties={properties} value={selectedId} onChange={select} className={className} label={siteMenu.switchProperty} />
  );
  const property = properties.find((p) => p.id === selectedId) ?? null;
  const theme = normaliseTheme(property?.theme_config);
  const host = data?.host as { business_name?: string } | null | undefined;
  const title = property?.name ?? host?.business_name ?? brand.name;

  const [navMode, setNavMode] = useState<NavMode>("full");
  // A per-browser preference, so it's read after the first render.
  useEffect(() => {
    try {
      setNavMode(readNavMode(window.localStorage.getItem(NAV_KEY)));
    } catch {
      // Private browsing can block storage; the full menu is fine.
    }
  }, []);
  function chooseNavMode(mode: NavMode) {
    setNavMode(mode);
    try {
      window.localStorage.setItem(NAV_KEY, mode);
    } catch {
      // Not remembered this time; nothing else depends on it.
    }
  }

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
      <DesktopNav
        mode={navMode}
        onMode={chooseNavMode}
        theme={theme}
        title={title}
        alertCount={alertCount}
        readOnly={readOnly}
        switcher={switcher}
        canWrite={canWrite}
        isOwner={isOwner}
        onSignOut={() => void leave()}
      />

      {(host as { contact_email?: string } | null | undefined)?.contact_email === DEMO_EMAIL ? (
        <button
          type="button"
          // The trial page swaps the shared demo for the visitor's own trial.
          onClick={() => void navigate({ to: "/start" })}
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
        <UserChip compact className="px-1.5" />
        <button
          type="button"
          onClick={leave}
          aria-label={auth.signOut}
          className="grid size-11 place-items-center rounded-xl text-muted-foreground"
        >
          <LogOut className="size-5" />
        </button>
      </header>
      {(data?.memberships.length ?? 0) > 1 || properties.length > 1 || readOnly ? (
        <div className="mx-3 mt-2 flex items-center gap-2 md:hidden print:hidden">
          <HostSwitcher className="h-10 flex-1 rounded-2xl" />
          {switcher("h-10 min-w-0 flex-1 rounded-2xl")}
          {readOnly}
        </div>
      ) : null}

      <main
        className={cn(
          "px-4 py-6 pb-32 transition-[margin,padding] duration-300 ease-out sm:px-6 md:pb-10",
          navMode === "full" ? "md:ml-72 md:py-10" : navMode === "rail" ? "md:ml-28 md:py-10" : "md:pb-10 md:pt-32",
        )}
      >
        <TrialBanner />
        <Outlet />
      </main>


      {/* Floating pill dock */}
      <nav
        aria-label="Main"
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto grid max-w-2xl grid-cols-7 gap-1 rounded-[1.75rem] p-1.5 md:hidden print:hidden"
      >
        {navItems.map(({ to, label, short, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={haptic}
            aria-label={label}
            className="spring flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 text-[10px] font-medium text-muted-foreground @container active:scale-90"
            activeProps={{ className: "bg-primary !text-primary-foreground shadow-soft", "aria-current": "page" }}
          >
            <span className="relative">
              <Icon className="size-5" />
              {to === "/app/today" && alertCount > 0 ? (
                <span className="absolute -right-2 -top-1 size-2.5 rounded-full bg-destructive ring-2 ring-surface" aria-label={`${alertCount} alerts`} />
              ) : null}
            </span>
            {/* Narrow tabs use the short form, like "Props" for Properties. */}
            <span aria-hidden className="hidden max-w-full truncate @[4.25rem]:block">{label}</span>
            <span aria-hidden className="block max-w-full truncate @[4.25rem]:hidden">{short}</span>
          </Link>
        ))}
      </nav>
    </ThemeScope>
  );
}

/**
 * The desktop menu. A grab bar on its edge resizes it: full width, an icon
 * rail, or (dragged right in) a bar along the top. The logo keeps its spot
 * through every change; the rest fades while the frame reshapes.
 */
function DesktopNav({
  mode,
  onMode,
  theme,
  title,
  alertCount,
  readOnly,
  switcher,
  canWrite,
  isOwner,
  onSignOut,
}: {
  mode: NavMode;
  onMode: (mode: NavMode) => void;
  theme: ReturnType<typeof normaliseTheme>;
  title: string;
  alertCount: number;
  readOnly: ReactNode;
  /** The property picker, sized for where it sits; empty with one property. */
  switcher: (className: string) => ReactNode;
  canWrite: boolean;
  isOwner: boolean;
  onSignOut: () => void;
}) {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);
  const drag = useRef<{ x: number; y: number; width: number; moved: boolean } | null>(null);
  const top = mode === "top";
  const rail = mode === "rail";

  function change(next: NavMode) {
    if (next === mode) return;
    setSettling(true);
    onMode(next);
    window.setTimeout(() => setSettling(false), 320);
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, width: top ? 0 : NAV_WIDTH[mode as "full" | "rail"], moved: false };
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    // From the top bar, pulling down brings the sidebar back.
    if (!top && d.moved) setDragWidth(Math.max(0, Math.min(NAV_WIDTH.full, d.width + e.clientX - d.x)));
  }
  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    setDragWidth(null);
    if (!d) return;
    if (!d.moved) return change(top ? "full" : cycleMode(mode));
    if (top) return e.clientY - d.y > 24 ? change("full") : undefined;
    change(modeForWidth(d.width + e.clientX - d.x));
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const smaller = e.key === "ArrowLeft" || e.key === "ArrowUp";
    const larger = e.key === "ArrowRight" || e.key === "ArrowDown";
    if (!smaller && !larger) return;
    e.preventDefault();
    change(stepMode(mode, smaller ? "smaller" : "larger"));
  }

  const width = top ? "calc(100% - 7rem)" : `${dragWidth ?? NAV_WIDTH[mode as "full" | "rail"]}px`;
  const narrow = rail || (dragWidth !== null && dragWidth < 180);
  const fade = settling ? "opacity-0" : "opacity-100 transition-opacity duration-200";
  const linkBase =
    "spring flex items-center gap-3 rounded-2xl text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-[0.97]";
  const active = { className: "bg-primary !text-primary-foreground shadow-soft", "aria-current": "page" } as const;
  // Labels show when there is room for them: always in the full sidebar,
  // never on the rail, and along the top once the bar is wide enough.
  const labelClass = narrow ? "sr-only" : top ? "sr-only @6xl:not-sr-only @6xl:truncate" : "truncate";

  return (
    <aside
      style={{ width, height: top ? "5.5rem" : "calc(100% - 2rem)" }}
      className={cn(
        "glass @container fixed left-4 top-4 z-20 hidden p-4 md:flex print:hidden",
        dragWidth === null ? "transition-[width,height,border-radius] duration-300 ease-out" : "",
        top ? "flex-row items-center gap-2 rounded-[1.75rem]" : "flex-col rounded-[2rem]",
      )}
    >
      <Link to="/" className="flex shrink-0 items-center gap-3 rounded-2xl px-2 py-2" title={title}>
        <LogoMark theme={theme} name={title} />
        <span className={cn("min-w-0", narrow ? "sr-only" : top ? "hidden @[84rem]:block" : "", fade)}>
          <span className="block truncate font-display text-lg leading-tight">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{brand.name}</span>
        </span>
      </Link>

      {!top && !narrow ? (
        <div className={fade}>
          <HostSwitcher className="mt-3 h-10 rounded-2xl" />
          {switcher("mt-2 h-10 w-full rounded-2xl")}
          {readOnly ? <div className="mt-3 px-2">{readOnly}</div> : null}
        </div>
      ) : null}

      <nav
        className={cn(
          "flex gap-1",
          top ? "min-w-0 flex-1 flex-row overflow-x-auto" : "mt-6 flex-col",
          fade,
        )}
        aria-label="Main"
      >
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={haptic}
            title={label}
            className={cn(linkBase, top ? "shrink-0 px-3 py-2.5" : narrow ? "justify-center px-3 py-3" : "px-3 py-3")}
            activeProps={active}
          >
            <span className="relative">
              <Icon className="size-5 shrink-0" />
              {to === "/app/today" && alertCount > 0 && (narrow || top) ? (
                <span className="absolute -right-1.5 -top-1 size-2.5 rounded-full bg-destructive ring-2 ring-surface" />
              ) : null}
            </span>
            <span className={labelClass}>{label}</span>
            {to === "/app/today" && alertCount > 0 && !narrow && !top ? (
              <span className="ml-auto rounded-full bg-destructive px-2 text-xs text-destructive-foreground" aria-label={`${alertCount} alerts`}>
                {alertCount}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className={cn("flex gap-1", top ? "shrink-0 flex-row items-center" : "mt-auto flex-col", fade)}>
        {top ? <HostSwitcher className="hidden h-10 w-44 rounded-2xl @[84rem]:flex" /> : null}
        {top ? switcher("hidden h-10 w-44 rounded-2xl @[72rem]:flex") : null}
        {canWrite ? (
          <Link
            to="/app/register"
            onClick={haptic}
            title={hostNav.register}
            className={cn(linkBase, narrow || top ? "justify-center p-3" : "px-3 py-3")}
            activeProps={active}
          >
            <NotebookPen className="size-5 shrink-0" />
            <span className={narrow || top ? "sr-only" : "truncate"}>{hostNav.register}</span>
          </Link>
        ) : null}
        {isOwner ? (
          <Link
            to="/app/activity"
            onClick={haptic}
            title={hostNav.activity}
            className={cn(linkBase, narrow || top ? "justify-center p-3" : "px-3 py-3")}
            activeProps={active}
          >
            <History className="size-5 shrink-0" />
            <span className={narrow || top ? "sr-only" : "truncate"}>{hostNav.activity}</span>
          </Link>
        ) : null}
        <div className={cn("flex items-center gap-1", narrow ? "flex-col" : "", top ? "" : "mt-2 border-t border-border pt-2")}>
          <UserChip compact={narrow || top} className={narrow || top ? "justify-center" : "flex-1"} />
          <button
            type="button"
            onClick={onSignOut}
            title={auth.signOut}
            aria-label={auth.signOut}
            className={cn(linkBase, "justify-center p-3")}
          >
            <LogOut className="size-5" />
          </button>
        </div>
        {top ? (
          <button type="button" onClick={() => change("full")} title={hostNav.menuToSide} aria-label={hostNav.menuToSide} className={cn(linkBase, "justify-center p-3")}>
            <PanelLeftOpen className="size-5" />
          </button>
        ) : null}
      </div>

      {/* The grab bar: drag sideways (or pull down from the top bar), tap to cycle, or use the arrow keys. */}
      <button
        type="button"
        role="separator"
        aria-orientation={top ? "horizontal" : "vertical"}
        aria-label={`${hostNav.menuGrab}. ${hostNav.menuModes[mode]}`}
        aria-valuetext={hostNav.menuModes[mode]}
        title={hostNav.menuModes[mode]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragWidth(null);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "group absolute grid touch-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          top ? "-bottom-2 left-1/2 h-4 w-20 -translate-x-1/2 cursor-ns-resize" : "-right-2 top-1/2 h-20 w-4 -translate-y-1/2 cursor-ew-resize",
        )}
      >
        <span
          className={cn(
            "rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary",
            top ? "h-1 w-12" : "h-12 w-1",
          )}
        />
      </button>
    </aside>
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
