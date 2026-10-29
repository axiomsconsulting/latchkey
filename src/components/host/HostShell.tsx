import { useEffect, useRef, useState, type ReactNode } from "react";
import { getGroupBrand } from "@/lib/group-brand.functions";
import { DEFAULT_GROUP_BRAND, effectiveLogo } from "@/lib/group-brand";
import { Link, Navigate, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Eye,
  History,
  Loader2,
  LogOut,
  Mail,
  CreditCard,
  NotebookPen,
  PanelLeftOpen,
  Settings,
  Sparkles,
  LayoutGrid,
  MessageSquareHeart,
  MoreHorizontal,
  Compass,
} from "lucide-react";

import { HostInbox } from "@/components/host/HostInbox";
import { HostSwitcher, useAccessWatch } from "@/components/host/HostSwitcher";
import { PropertyPicker } from "@/components/host/PropertyPicker";
import {
  AccessGate,
  AnnouncementPopup,
  FeedbackButton,
  FeedbackDialog,
  ShellBanners,
} from "@/components/host/ShellExtras";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SetPasswordPrompt } from "@/components/host/SetPasswordPrompt";
import { WhatsNewPopup } from "@/components/host/WhatsNewPopup";
import { GuidedTour, openTour } from "@/components/host/GuidedTour";
import { whatsNewCopy } from "@/content/copy";
import { APP_VERSION } from "@/lib/app-version";
import { TrialBanner } from "@/components/host/TrialBanner";
import { UserChip } from "@/components/host/UserChip";
import { LogoMark } from "@/components/theme/LogoMark";
import { OmniSearch } from "@/components/host/OmniSearch";
import { DemoDock, HostDemoSwitch } from "@/components/DemoDock";
import { NavIcon } from "@/components/NavIcon";
import { MenuStrip } from "@/components/host/MenuStrip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUi } from "@/hooks/use-site";
import { resolveNav, type NavItemResolved } from "@/lib/ui-config";
import { rememberDashboard } from "@/lib/home-redirect";
import { rememberHost } from "@/lib/last-host";

import { ThemeScope } from "@/components/theme/ThemeScope";
import { Button } from "@/components/ui/button";
import {
  adminCopy,
  auth,
  billingCopy,
  brand,
  feedbackCopy,
  hostNav,
  tourCopy,
  invite as inviteCopy,
  siteMenu,
  team as teamCopy,
} from "@/content/copy";
import { useAlerts, useRole, useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { getWorkspace } from "@/lib/host.functions";
import { DEMO_EMAIL, signOut } from "@/lib/demo-session";
import {
  NAV_WIDTH,
  cycleMode,
  modeForWidth,
  readNavMode,
  stepMode,
  type NavMode,
} from "@/lib/nav-mode";
import { normaliseTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The menu, as the super admin set it for every host (Latchkey admin → Menu
 * and pages): order, which items show, their own items and icons. Latchkey
 * admin is always there for super admins.
 */
function useMenu(superAdmin: boolean): NavItemResolved[] {
  const ui = useUi();
  const labels: Record<string, string> = {
    ...(hostNav as unknown as Record<string, string>),
    admin: adminCopy.navLabel,
  };
  return resolveNav(ui.nav, labels, { superAdmin });
}

const shortLabel = (item: NavItemResolved) =>
  item.builtIn ? ((hostNav.short as Record<string, string>)[item.id] ?? item.label) : item.label;

/** A menu link: a page in the app, or another site in a new tab. */
function MenuLink({
  item,
  className,
  activeProps,
  onClick,
  title,
  ariaLabel,
  children,
}: {
  item: NavItemResolved;
  className: string;
  activeProps?: Record<string, unknown>;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        className={className}
        data-tour={`nav-${item.id}`}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      to={item.href as never}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={className}
      activeProps={activeProps as never}
      data-tour={`nav-${item.id}`}
    >
      {children}
    </Link>
  );
}

const NAV_KEY = "latchkey.nav";

/** Signed in as the shared public demo account. */
function useIsSharedDemo(): boolean {
  const ws = useWorkspace();
  return (
    (ws.data?.host as { contact_email?: string } | null | undefined)?.contact_email === DEMO_EMAIL
  );
}

function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
}

export function HostShell() {
  const navigate = useNavigate();
  const alertCount = useAlerts().data?.alerts.length ?? 0;
  const { data } = useWorkspace();
  const { canWrite, isOwner } = useRole();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // The phone dock: the same menu, without Latchkey admin (reached from Settings there).
  const allPages = useMenu(data?.isSuperAdmin === true);
  // Seven fit; Settings always keeps its place, and whatever doesn't fit goes in the More menu.
  const dockable = allPages.filter((i) => i.id !== "admin");
  const settingsItem = dockable.find((i) => i.id === "settings");
  const dock =
    dockable.length <= 7
      ? dockable
      : [
          ...dockable.filter((i) => i.id !== "settings").slice(0, settingsItem ? 6 : 7),
          ...(settingsItem ? [settingsItem] : []),
        ];
  const overflow = dockable.filter((i) => !dock.includes(i));
  useAccessWatch();
  // Next time "/" opens on this device, go straight to the dashboard (not the shared demo).
  useEffect(() => {
    if (data)
      rememberDashboard(
        canWrite && (data.host as { contact_email?: string } | null)?.contact_email !== DEMO_EMAIL,
      );
  }, [data, canWrite]);
  const properties = (data?.properties ?? []) as Array<{
    id: string;
    name: string;
    theme_config: unknown;
  }>;
  const { selectedId, select } = useSelectedProperty(properties);
  const switcher = (className: string) => (
    <PropertyPicker
      properties={properties}
      value={selectedId}
      onChange={select}
      className={className}
      label={siteMenu.switchProperty}
    />
  );
  const property = properties.find((p) => p.id === selectedId) ?? null;
  const theme = normaliseTheme(property?.theme_config);
  const host = data?.host as { business_name?: string } | null | undefined;
  const isSharedDemo = useIsSharedDemo();
  const title = property?.name ?? host?.business_name ?? brand.name;
  // The group: its logo where the host chose it, and its name under the property's.
  const groupFn = useServerFn(getGroupBrand);
  const groupQ = useQuery({
    queryKey: ["group-brand", data?.hostId],
    enabled: !!data?.hostId,
    queryFn: () => groupFn({ data: { hostId: data!.hostId } }),
    staleTime: 60_000,
  });
  const logoTheme = {
    ...theme,
    ...effectiveLogo(theme, groupQ.data?.brand ?? DEFAULT_GROUP_BRAND),
  };
  const groupName =
    host?.business_name && host.business_name !== title ? host.business_name : brand.name;
  // Remembered for the sign-in page ("welcome back" with their own logo); never a support view or the demo.
  useEffect(() => {
    const support = (data as { support?: unknown } | undefined)?.support;
    const email = (host as { contact_email?: string } | null | undefined)?.contact_email;
    if (!data || support || email === DEMO_EMAIL || !host?.business_name) return;
    rememberHost(title, theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, title, property?.id]);

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
  // A Commission Partner has no rooms to run: their own account instead of an empty "My rooms".
  if (data && "partnerOnly" in data) return <Navigate to="/partners" replace />;

  const readOnly =
    data && !canWrite ? (
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
        logoTheme={logoTheme}
        groupName={groupName}
        title={title}
        alertCount={alertCount}
        readOnly={readOnly}
        switcher={switcher}
        canWrite={canWrite}
        isOwner={isOwner}
        onSignOut={() => void leave()}
      />

      {/* Desktop: messages sit top right, away from the sidebar */}
      <div className="glass fixed right-6 top-6 z-30 hidden items-center gap-0.5 rounded-2xl p-1 md:flex print:hidden">
        <OmniSearch pages={allPages} />
        <HostInbox propertyId={selectedId ?? null} />
      </div>

      {/* Phone/tablet portrait: compact glass header */}
      <header className="glass sticky top-2 z-10 mx-3 mt-2 flex items-center gap-1 rounded-2xl px-3 py-2 md:hidden print:hidden">
        <Link
          to="/"
          search={{ home: true }}
          aria-label={brand.name}
          className="shrink-0 rounded-xl"
        >
          <LogoMark theme={logoTheme} name={title} className="size-9" />
        </Link>
        <span className="min-w-0 flex-1 truncate font-display text-lg">{title}</span>
        <OmniSearch pages={allPages} className="size-10" />
        <HostInbox propertyId={selectedId ?? null} />
        <UserChip compact className="px-1.5" />
        {/* Everything else in one menu, so the name has room on a phone. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={hostNav.moreDrawer}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary"
            >
              <MoreHorizontal className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 rounded-2xl p-1.5">
            {/* Menu items that don't fit in the phone's bottom bar. */}
            {overflow.map((it) => (
              <DropdownMenuItem key={it.id} asChild className="min-h-11 gap-3 rounded-xl md:hidden">
                {it.external ? (
                  <a href={it.href} target="_blank" rel="noreferrer">
                    <NavIcon icon={it.icon} className="size-5" /> {it.label}
                  </a>
                ) : (
                  <Link to={it.href} data-tour={`nav-${it.id}`}>
                    <NavIcon icon={it.icon} className="size-5" /> {it.label}
                  </Link>
                )}
              </DropdownMenuItem>
            ))}
            {overflow.length ? <DropdownMenuSeparator className="md:hidden" /> : null}
            <DropdownMenuItem asChild className="min-h-11 gap-3 rounded-xl">
              <Link to="/app/whats-new">
                <Sparkles className="size-5" /> {whatsNewCopy.navLabel}
                <span className="ml-auto text-xs text-muted-foreground">v{APP_VERSION}</span>
              </Link>
            </DropdownMenuItem>
            {canWrite ? (
              <DropdownMenuItem asChild className="min-h-11 gap-3 rounded-xl">
                <Link to="/app/register">
                  <NotebookPen className="size-5" /> {hostNav.register}
                </Link>
              </DropdownMenuItem>
            ) : null}
            {isOwner ? (
              <DropdownMenuItem asChild className="min-h-11 gap-3 rounded-xl">
                <Link to="/app/activity">
                  <History className="size-5" /> {hostNav.activity}
                </Link>
              </DropdownMenuItem>
            ) : null}
            {isOwner && !isSharedDemo ? (
              <DropdownMenuItem asChild className="min-h-11 gap-3 rounded-xl">
                <Link to="/app/billing">
                  <CreditCard className="size-5" /> {billingCopy.navLabel}
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem className="min-h-11 gap-3 rounded-xl" onSelect={() => openTour()}>
              <Compass className="size-5" /> {tourCopy.navLabel}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 gap-3 rounded-xl"
              onSelect={() => setFeedbackOpen(true)}
            >
              <MessageSquareHeart className="size-5" /> {feedbackCopy.button}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11 gap-3 rounded-xl" onSelect={() => void leave()}>
              <LogOut className="size-5" /> {auth.signOut}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {feedbackOpen ? <FeedbackDialog onClose={() => setFeedbackOpen(false)} /> : null}
      {(data?.memberships.length ?? 0) > 1 || properties.length > 1 || readOnly ? (
        <div className="mx-3 mt-2 flex items-center gap-2 md:hidden print:hidden">
          <HostSwitcher className="h-10 flex-1 rounded-2xl" />
          {switcher("h-10 min-w-0 flex-1 rounded-2xl")}
          {readOnly}
        </div>
      ) : null}

      {/* The shared demo: a tab on the side of the screen opening the property switcher (previews of each look) and the ways out. */}
      {isSharedDemo ? (
        <DemoDock
          mode="host"
          onLeave={async () => {
            await signOut();
            await navigate({ to: "/", search: { home: true } });
          }}
        >
          {(done) => (
            <>
              <button
                type="button"
                onClick={() => {
                  done();
                  openTour();
                }}
                className="inline-flex h-[36px] w-full items-center justify-center gap-[6px] rounded-full bg-primary px-[14px] text-[13px] font-semibold text-primary-foreground"
              >
                <Compass className="size-[14px]" /> {tourCopy.navLabel}
              </button>
              <HostDemoSwitch
                properties={properties}
                value={selectedId ?? null}
                done={done}
                onChange={(id) => {
                  select(id);
                  void navigate({ to: "/app/today" });
                }}
              />
            </>
          )}
        </DemoDock>
      ) : null}

      <main
        data-host-main
        className={cn(
          // On paper: none of the dashboard's spacing around what's printed.
          "px-4 py-6 pb-32 transition-[margin,padding] duration-300 ease-out sm:px-6 md:pb-10 print:!m-0 print:!p-0",
          navMode === "full"
            ? "md:ml-72 md:py-10"
            : navMode === "rail"
              ? "md:ml-28 md:py-10"
              : "md:pb-10 md:pt-32",
        )}
      >
        <div className="print:hidden">
          <ShellBanners />
          <TrialBanner />
          <SetPasswordPrompt />
        </div>
        <AccessGate>
          <Outlet />
        </AccessGate>
        <AnnouncementPopup />
        <GuidedTour autoOffer={isSharedDemo} />
        <WhatsNewPopup
          admin={data?.isSuperAdmin === true}
          skip={
            !data ||
            (host as { contact_email?: string } | null | undefined)?.contact_email === DEMO_EMAIL
          }
        />
      </main>

      {/* Floating pill dock */}
      <nav
        aria-label="Main"
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto grid max-w-2xl gap-1 rounded-[1.75rem] p-1.5 md:hidden print:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, dock.length)}, minmax(0, 1fr))` }}
      >
        {dock.map((it) => (
          <MenuLink
            key={it.id}
            item={it}
            onClick={haptic}
            ariaLabel={it.label}
            className="spring flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 text-[10px] font-medium text-muted-foreground @container active:scale-90 max-[360px]:px-0 max-[360px]:text-[9px] max-[360px]:tracking-tight"
            activeProps={{
              className: "bg-primary !text-primary-foreground shadow-soft",
              "aria-current": "page",
            }}
          >
            <span className="relative">
              <NavIcon icon={it.icon} iconUrl={it.iconUrl} iconColour={it.iconColour} />
              {it.id === "today" && alertCount > 0 ? (
                <span
                  className="absolute -right-2 -top-1 size-2.5 rounded-full bg-destructive ring-2 ring-surface"
                  aria-label={`${alertCount} alerts`}
                />
              ) : null}
            </span>
            {/* Narrow tabs use the short form, like "Props" for Properties. */}
            <span aria-hidden className="hidden max-w-full truncate @[4.25rem]:block">
              {it.label}
            </span>
            <span aria-hidden className="block max-w-full truncate @[4.25rem]:hidden">
              {shortLabel(it)}
            </span>
          </MenuLink>
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
/** Whether a media query matches (false on the server and until mounted). */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const update = () => setOn(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [query]);
  return on;
}

/** A group of menu items folded behind one button, for when there's hardly any room. */
function MenuDrawer({
  label,
  icon: Icon,
  top,
  narrow,
  linkBase,
  children,
}: {
  label: string;
  icon: typeof LayoutGrid;
  top: boolean;
  narrow: boolean;
  linkBase: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className={cn(linkBase, "shrink-0", top || narrow ? "justify-center p-2.5" : "px-3 py-2")}
        >
          <Icon className="size-5 shrink-0" />
          <span className={top || narrow ? "sr-only" : "truncate"}>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={top ? "bottom" : "right"}
        align="start"
        className="glass max-h-[80vh] w-64 overflow-y-auto rounded-2xl p-2"
      >
        <div className="flex flex-col gap-1">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

function DesktopNav({
  mode,
  onMode,
  theme,
  logoTheme,
  groupName,
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
  logoTheme?: ReturnType<typeof normaliseTheme>;
  groupName?: string;
  title: string;
  alertCount: number;
  readOnly: ReactNode;
  /** The property picker, sized for where it sits; empty with one property. */
  switcher: (className: string) => ReactNode;
  canWrite: boolean;
  isOwner: boolean;
  onSignOut: () => void;
}) {
  const isSharedDemo = useIsSharedDemo();
  const isSuperAdmin = useWorkspace().data?.isSuperAdmin === true;
  const menu = useMenu(isSuperAdmin);
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
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      width: top ? 0 : NAV_WIDTH[mode as "full" | "rail"],
      moved: false,
    };
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    // From the top bar, pulling down brings the sidebar back.
    if (!top && d.moved)
      setDragWidth(Math.max(0, Math.min(NAV_WIDTH.full, d.width + e.clientX - d.x)));
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
  const active = {
    className: "bg-primary !text-primary-foreground shadow-soft",
    "aria-current": "page",
  } as const;
  // Labels show when there is room for them: always in the full sidebar,
  // never on the rail, and along the top once the bar is wide enough.
  const labelClass = narrow
    ? "sr-only"
    : top
      ? "sr-only @6xl:not-sr-only @6xl:truncate"
      : "truncate";
  // Less height (side menu) or width (top bar): tighter rows first, then two drawers.
  const dense = useMedia(top ? "(max-width: 1280px)" : "(max-height: 860px)");
  const drawers = useMedia(top ? "(max-width: 860px)" : "(max-height: 600px)");
  const pad = top
    ? dense
      ? "shrink-0 px-2.5 py-2"
      : "shrink-0 px-3 py-2.5"
    : narrow
      ? cn("justify-center px-3", dense ? "py-2" : "py-3")
      : cn("px-3", dense ? "py-2" : "py-3");
  const pinned = menu.find((i) => i.id === "today") ?? menu[0];
  const rest = menu.filter((i) => i !== pinned);

  // A menu item; in a drawer, always with its label.
  const menuLink = (it: NavItemResolved, inDrawer = false) => (
    <MenuLink
      key={it.id}
      item={it}
      onClick={haptic}
      title={it.label}
      className={cn(linkBase, inDrawer ? "w-full px-3 py-2.5" : pad)}
      activeProps={active}
    >
      <span className="relative">
        <NavIcon icon={it.icon} iconUrl={it.iconUrl} iconColour={it.iconColour} />
        {it.id === "today" && alertCount > 0 && (narrow || top) && !inDrawer ? (
          <span className="absolute -right-1.5 -top-1 size-2.5 rounded-full bg-destructive ring-2 ring-surface" />
        ) : null}
      </span>
      <span className={inDrawer ? "truncate" : labelClass}>{it.label}</span>
      {it.id === "today" && alertCount > 0 && !narrow && !top ? (
        <span
          className="ml-auto rounded-full bg-destructive px-2 text-xs text-destructive-foreground"
          aria-label={`${alertCount} alerts`}
        >
          {alertCount}
        </span>
      ) : null}
    </MenuLink>
  );

  // Guest register to feedback: the second group.
  const extras = (inDrawer: boolean) => {
    const cls = cn(
      linkBase,
      inDrawer
        ? "w-full px-3 py-2.5"
        : narrow || top
          ? cn("justify-center", dense ? "p-2" : "p-3")
          : pad,
    );
    const text = inDrawer ? "truncate" : narrow || top ? "sr-only" : "truncate";
    const one = (to: string, label: string, Icon: typeof NotebookPen) => (
      <Link
        key={to}
        to={to as never}
        onClick={haptic}
        title={label}
        className={cls}
        activeProps={active}
      >
        <Icon className="size-5 shrink-0" />
        <span className={text}>{label}</span>
      </Link>
    );
    return (
      <>
        {canWrite ? one("/app/register", hostNav.register, NotebookPen) : null}
        {isOwner ? one("/app/activity", hostNav.activity, History) : null}
        {one("/app/whats-new", `${whatsNewCopy.navLabel} · v${APP_VERSION}`, Sparkles)}
        <button type="button" onClick={() => openTour()} title={tourCopy.navLabel} className={cls}>
          <Compass className="size-5 shrink-0" />
          <span className={text}>{tourCopy.navLabel}</span>
        </button>
        {isOwner && !isSharedDemo ? one("/app/billing", billingCopy.navLabel, CreditCard) : null}
        <FeedbackButton
          compact={!inDrawer && (narrow || top)}
          {...(inDrawer ? { className: "w-full" } : {})}
        />
      </>
    );
  };

  return (
    <aside
      style={{ width, height: top ? "5.5rem" : "calc(100% - 2rem)" }}
      className={cn(
        "glass @container fixed left-4 top-4 z-20 hidden p-4 md:flex print:hidden",
        dragWidth === null ? "transition-[width,height,border-radius] duration-300 ease-out" : "",
        top ? "flex-row items-center gap-2 rounded-[1.75rem]" : "flex-col rounded-[2rem]",
      )}
    >
      <Link
        to="/"
        search={{ home: true }}
        className="flex shrink-0 items-center gap-3 rounded-2xl px-2 py-2"
        title={title}
      >
        <LogoMark theme={logoTheme ?? theme} name={title} />
        <span
          className={cn("min-w-0", narrow ? "sr-only" : top ? "hidden @[84rem]:block" : "", fade)}
        >
          <span className="block truncate font-display text-lg leading-tight">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {groupName ?? brand.name}
          </span>
        </span>
      </Link>

      {!top && !narrow ? (
        <div className={fade}>
          <HostSwitcher className="mt-3 h-10 rounded-2xl" />
          {switcher("mt-2 h-10 w-full rounded-2xl")}
          {readOnly ? <div className="mt-3 px-2">{readOnly}</div> : null}
        </div>
      ) : null}

      {/* Today stays put; the rest of the menu and the extras scroll (arrows, no scrollbars) or fold into drawers. */}
      <nav
        className={cn(
          "flex min-h-0 min-w-0 gap-1",
          top ? "flex-1 flex-row items-center" : cn("flex-1 flex-col", dense ? "mt-3" : "mt-6"),
          fade,
        )}
        aria-label="Main"
      >
        {pinned ? menuLink(pinned) : null}
        {drawers ? (
          <>
            <MenuDrawer
              label={hostNav.menuDrawer}
              icon={LayoutGrid}
              top={top}
              narrow={narrow}
              linkBase={linkBase}
            >
              {rest.map((it) => menuLink(it, true))}
            </MenuDrawer>
            <MenuDrawer
              label={hostNav.moreDrawer}
              icon={MoreHorizontal}
              top={top}
              narrow={narrow}
              linkBase={linkBase}
            >
              {extras(true)}
            </MenuDrawer>
            {top ? null : <span className="flex-1" />}
          </>
        ) : (
          <>
            <MenuStrip
              direction={top ? "horizontal" : "vertical"}
              label={hostNav.menuDrawer}
              className={top ? "flex-1" : "flex-[1_1_auto]"}
            >
              {rest.map((it) => menuLink(it))}
            </MenuStrip>
            <MenuStrip
              direction={top ? "horizontal" : "vertical"}
              label={hostNav.moreDrawer}
              className={
                top
                  ? "max-w-[40%] shrink"
                  : cn("flex-[0_1_auto] border-t border-border", dense ? "mt-1 pt-1" : "mt-2 pt-2")
              }
            >
              {extras(false)}
            </MenuStrip>
          </>
        )}
      </nav>

      {/* Your profile and signing out stay at the end, always in view. */}
      <div className={cn("flex shrink-0 gap-1", top ? "flex-row items-center" : "flex-col", fade)}>
        {top ? <HostSwitcher className="hidden h-10 w-44 rounded-2xl @[84rem]:flex" /> : null}
        {top ? switcher("hidden h-10 w-44 rounded-2xl @[72rem]:flex") : null}
        <div
          className={cn(
            "flex items-center gap-1",
            narrow ? "flex-col" : "",
            top ? "" : cn("border-t border-border", dense ? "mt-1 pt-1" : "mt-2 pt-2"),
          )}
        >
          <UserChip
            compact={narrow || top}
            className={narrow || top ? "justify-center" : "flex-1"}
          />
          <button
            type="button"
            onClick={onSignOut}
            title={auth.signOut}
            aria-label={auth.signOut}
            className={cn(linkBase, "justify-center", dense ? "p-2" : "p-3")}
          >
            <LogOut className="size-5" />
          </button>
        </div>
        {/* The app version, for support. */}
        {!top && !narrow ? (
          <p className="px-3 pt-1 text-[11px] text-muted-foreground" title={APP_VERSION}>
            {hostNav.version(APP_VERSION)}
          </p>
        ) : null}
        {top ? (
          <button
            type="button"
            onClick={() => change("full")}
            title={hostNav.menuToSide}
            aria-label={hostNav.menuToSide}
            className={cn(linkBase, "justify-center p-3")}
          >
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
          top
            ? "-bottom-2 left-1/2 h-4 w-20 -translate-x-1/2 cursor-ns-resize"
            : "-right-2 top-1/2 h-20 w-4 -translate-y-1/2 cursor-ew-resize",
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
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={onSignOut}
        >
          {auth.signOut}
        </button>
      </div>
    </main>
  );
}
