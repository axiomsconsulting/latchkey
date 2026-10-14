import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, Check, DoorOpen, LayoutDashboard, Menu, PlayCircle, Sparkles } from "lucide-react";

import { DemoPicker } from "@/components/DemoPicker";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { siteMenu } from "@/content/copy";
import { useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { supabase } from "@/integrations/supabase/client";
import { signOut } from "@/lib/demo-session";
import { cn } from "@/lib/utils";

const item =
  "flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-base font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn;
}

/**
 * Public pages' menu. Host and Guest shortcuts hang off the menu button on
 * larger screens and sit in a bottom bar on phones. Never shown on guest
 * check-in screens, which stay locked to one property.
 */
export function SiteMenu() {
  const [open, setOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const signedIn = useSignedIn();
  const navigate = useNavigate();
  const close = () => setOpen(false);

  return (
    <>
      <div className="relative">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label={siteMenu.open} className="relative z-10 size-11">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="font-display">{siteMenu.title}</SheetTitle>
            </SheetHeader>
            <nav className="mt-4 flex flex-col gap-1 px-2 pb-6" aria-label={siteMenu.title}>
              <Link to="/" search={{ home: true }} className={item} onClick={close}>
                {siteMenu.home}
              </Link>
              <button type="button" className={item} onClick={() => { close(); setDemoOpen(true); }}>
                {siteMenu.demo}
              </button>
              <a href="/?home=1#pricing" className={item} onClick={close}>{siteMenu.pricing}</a>
              <Link to="/p/$code" params={{ code: "tour" }} className={item} onClick={close}>{siteMenu.guest}</Link>
              <Link to="/checkin" className={item} onClick={close}>
                {siteMenu.guestPin}
              </Link>
              <Link to="/about" className={item} onClick={close}>{siteMenu.about}</Link>
              <Link to="/developers" className={item} onClick={close}>{siteMenu.developers}</Link>
              {signedIn ? (
                <>
                  <hr className="my-2 border-border" />
                  <Link to="/app/today" className={item} onClick={close}>{siteMenu.dashboard}</Link>
                  <PropertyList onPicked={close} />
                  <Link to="/app/bookings" className={item} onClick={close}>{siteMenu.bookings}</Link>
                  <Link to="/app/services" className={item} onClick={close}>{siteMenu.services}</Link>
                  <Link to="/app/settings" className={item} onClick={close}>{siteMenu.admin}</Link>
                  <button
                    type="button"
                    className={item}
                    onClick={async () => { close(); await signOut(); await navigate({ to: "/", search: { home: true } }); }}
                  >
                    {siteMenu.signOut}
                  </button>
                </>
              ) : (
                <>
                <Link to="/start" className={item} onClick={close}>{siteMenu.trial}</Link>
                <Link to="/auth" className={item} onClick={close}>{siteMenu.signIn}</Link>
              </>
              )}
            </nav>
          </SheetContent>
        </Sheet>
        {/* Larger screens: the shortcuts hang just below the menu button. */}
        <Shortcuts signedIn={signedIn} className="absolute right-0 top-full mt-2 hidden sm:flex" />
      </div>
      {/* Phones: the same shortcuts in a bottom bar, within thumb reach. */}
      <Shortcuts signedIn={signedIn} bar className="sm:hidden" onDemo={() => setDemoOpen(true)} />
      <DemoPicker open={demoOpen} onOpenChange={setDemoOpen} />
    </>
  );
}

function Shortcuts({
  signedIn,
  bar = false,
  className,
  onDemo,
}: {
  signedIn: boolean;
  bar?: boolean;
  className?: string;
  onDemo?: () => void;
}) {
  const host = signedIn ? "/app/today" : "/auth";
  if (bar) {
    // Phones: a bottom bar with the demo and trial up front, then Host and Guest.
    const tab =
      "spring flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-95";
    return (
      <nav
        aria-label={siteMenu.shortcuts}
        className={cn(
          "glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-md gap-1 rounded-[1.75rem] p-1.5",
          className,
        )}
      >
        <button type="button" className={tab} onClick={onDemo}>
          <PlayCircle className="size-5" /> {siteMenu.demoShort}
        </button>
        {signedIn ? null : (
          <Link to="/start" className={cn(tab, "bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground")}>
            <Sparkles className="size-5" /> {siteMenu.trialShort}
          </Link>
        )}
        <Link to={host} className={tab} title={siteMenu.hostHint}>
          <LayoutDashboard className="size-5" /> {siteMenu.host}
        </Link>
        <Link to="/checkin" className={tab} title={siteMenu.guestHint}>
          <DoorOpen className="size-5" /> {siteMenu.guestShort}
        </Link>
      </nav>
    );
  }
  // Larger screens: two separate bubbles just below the menu button.
  const bubble =
    "spring flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-soft hover:-translate-y-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <nav aria-label={siteMenu.shortcuts} className={cn("flex gap-2", className)}>
      <Link to={host} className={bubble} title={siteMenu.hostHint}>
        <LayoutDashboard className="size-3.5" /> {siteMenu.host}
      </Link>
      <Link to="/checkin" className={bubble} title={siteMenu.guestHint}>
        <DoorOpen className="size-3.5" /> {siteMenu.guestShort}
      </Link>
    </nav>
  );
}

/** Signed-in hosts with more than one property pick which one the dashboard shows. */
function PropertyList({ onPicked }: { onPicked: () => void }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const properties = (ws.data?.properties ?? []) as Array<{ id: string; name: string }>;
  const { selectedId, select } = useSelectedProperty(properties);
  if (properties.length < 2) return null;
  return (
    <div className="my-1 rounded-2xl bg-secondary/50 p-2">
      <p className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
        <Building2 className="size-4" /> {siteMenu.switchProperty}
      </p>
      {properties.map((p) => (
        <button
          key={p.id}
          type="button"
          className={cn(item, "min-h-11 text-sm")}
          aria-current={p.id === selectedId ? "true" : undefined}
          onClick={() => {
            select(p.id);
            onPicked();
            void navigate({ to: "/app/today" });
          }}
        >
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          {p.id === selectedId ? <Check className="size-4 text-primary" /> : null}
        </button>
      ))}
    </div>
  );
}
