import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu } from "lucide-react";

import { DemoPicker } from "@/components/DemoPicker";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { siteMenu } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";

const item =
  "flex min-h-12 w-full items-center rounded-2xl px-4 text-left text-base font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Marketing-page menu. Never rendered on guest screens, which stay locked. */
export function SiteMenu() {
  const [open, setOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  const close = () => setOpen(false);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label={siteMenu.open} className="size-11">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-80">
          <SheetHeader>
            <SheetTitle className="font-display">{siteMenu.title}</SheetTitle>
          </SheetHeader>
          <nav className="mt-4 flex flex-col gap-1 px-2" aria-label={siteMenu.title}>
            <button type="button" className={item} onClick={() => { close(); setDemoOpen(true); }}>
              {siteMenu.demo}
            </button>
            <a href="/#pricing" className={item} onClick={close}>{siteMenu.pricing}</a>
            <Link to="/p/$code" params={{ code: "tour" }} className={item} onClick={close}>{siteMenu.guest}</Link>
            {signedIn ? (
              <>
                <Link to="/app/today" className={item} onClick={close}>{siteMenu.dashboard}</Link>
                <Link to="/app/bookings" className={item} onClick={close}>{siteMenu.bookings}</Link>
                <Link to="/app/services" className={item} onClick={close}>{siteMenu.services}</Link>
                <Link to="/app/settings" className={item} onClick={close}>{siteMenu.admin}</Link>
                <button
                  type="button"
                  className={item}
                  onClick={async () => { close(); await supabase.auth.signOut(); await navigate({ to: "/" }); }}
                >
                  {siteMenu.signOut}
                </button>
              </>
            ) : (
              <Link to="/auth" className={item} onClick={close}>{siteMenu.signIn}</Link>
            )}
          </nav>
        </SheetContent>
      </Sheet>
      <DemoPicker open={demoOpen} onOpenChange={setDemoOpen} />
    </>
  );
}
