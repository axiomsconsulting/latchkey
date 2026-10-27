import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { captureAttribution, captureOnce } from "@/lib/attribution";

import appCss from "../styles.css?url";
import { Toaster } from "../components/ui/sonner";
import { VisitTracker } from "../components/VisitTracker";
import { CookieBanner } from "../components/CookieBanner";
import { PwaSetup } from "../components/PwaSetup";
import { AuthSession } from "../components/AuthSession";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { rebrand, setBrand } from "@/lib/brand";
import { loadSite } from "@/lib/site-client";

// On a host's own domain, the platform's own pages (home, pricing, trial, PIN entry) open their property instead.
const PLATFORM_ONLY = /^\/(about|start|developers|checkin)?\/?$/;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    // Where this visit came from, kept for the session before anything redirects (/tour, /p, the demo).
    if (typeof window !== "undefined")
      captureAttribution(new URLSearchParams(window.location.search));
    const site = await loadSite().catch(() => null);
    if (site) setBrand(site.brand);
    const code = site?.tenant?.shortCode;
    if (code && PLATFORM_ONLY.test(location.pathname))
      throw redirect({ to: "/$slug", params: { slug: code } });
    return { site };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: rebrand("Latchkey — guest operations for independent accommodation") },
      {
        name: "description",
        content: rebrand(
          "Latchkey handles guest arrivals, house rules and extras for hosts letting rooms across Airbnb, Booking.com, Homestay.com and direct.",
        ),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // Installable app (PWA): colours, and iPhone/iPad home-screen behaviour.
      { name: "theme-color", content: "#194129" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: rebrand("Latchkey") },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      // Follows the site logo the super admin chose (Latchkey admin → Brand).
      { rel: "icon", href: "/api/public/brand/icon" },
      // Made per site, so the installed app carries the brand's name.
      { rel: "manifest", href: "/api/public/manifest/app" },
      { rel: "apple-touch-icon", href: "/api/public/brand/apple" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, site } = Route.useRouteContext() as {
    queryClient: QueryClient;
    site?: { brand: unknown } | null;
  };
  // The brand the server rendered with (beforeLoad doesn't run again in the browser on
  // first load): set before any page draws a logo or a name, so they never fall back to the default.
  if (site) setBrand(site.brand);
  // Before any page reads it: where this visit came from (idempotent, browser only).
  captureOnce();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" richColors />
      <VisitTracker />
      <CookieBanner />
      <PwaSetup />
      <AuthSession />
    </QueryClientProvider>
  );
}
