import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  BookOpen,
  CalendarDays,
  Gift,
  HardHat,
  LayoutGrid,
  Loader2,
  Palette,
  Plug,
  Radio,
  Search,
  Settings,
  Sparkles,
  Stamp,
  UserRound,
  Wrench,
  Building2,
  type LucideIcon,
} from "lucide-react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { releasesFor } from "@/content/changelog";
import { adminCopy, billingCopy, hostNav, integrations as integrationsCopy, omniCopy as copy, settingsRailCopy, themeStudio, whatsNewCopy } from "@/content/copy";
import { useSelectedProperty, useWorkspace } from "@/hooks/use-host-data";
import { SECTIONS } from "@/lib/guide";
import { INTEGRATION_KEYS } from "@/lib/integration-modes";
import { ADMIN_SETTINGS, AREA_PAGES, cleanQuery, rankHits, type SearchHit, type SearchKind } from "@/lib/omni-search";
import { omniSearch as searchFns } from "@/lib/search.functions";
import { cn } from "@/lib/utils";

const ICONS: Record<SearchKind, LucideIcon> = {
  page: LayoutGrid,
  setting: Settings,
  feature: Sparkles,
  logo: Stamp,
  integration: Radio,
  guide: BookOpen,
  guest: UserRound,
  property: Building2,
  room: BedDouble,
  extra: Gift,
  job: Wrench,
  trade: HardHat,
  connection: Plug,
  look: Palette,
  enquiry: CalendarDays,
};

/** The groups results show under, in this order. */
const GROUPS: Array<{ key: string; kinds: SearchKind[] }> = [
  { key: "guests", kinds: ["guest", "enquiry"] },
  { key: "yours", kinds: ["property", "room", "guide", "extra", "job", "trade", "connection", "look"] },
  { key: "pages", kinds: ["page", "setting"] },
  { key: "features", kinds: ["feature", "logo", "integration"] },
];

/**
 * Search everything from one box (top right, before the bell; ⌘K / Ctrl+K):
 * app pages, settings, features, logos, Latchkey's guide sections, and this
 * business's own guests, stays, guide text, extras, jobs, tradespeople,
 * calendar links and looks. Each result lands on the thing itself.
 */
export function OmniSearch({ pages, className }: { pages: Array<{ id: string; label: string; href: string; external: boolean }>; className?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const ws = useWorkspace();
  const navigate = useNavigate();
  const properties = (ws.data?.properties ?? []) as Array<{ id: string; name: string }>;
  const { select } = useSelectedProperty(properties);
  const hostId = ws.data?.hostId ?? null;
  const superAdmin = ws.data?.isSuperAdmin === true;
  const searchFn = useServerFn(searchFns);

  // ⌘K / Ctrl+K opens it from anywhere in the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ask the server a moment after typing stops.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(cleanQuery(text)), 220);
    return () => window.clearTimeout(t);
  }, [text]);

  const remote = useQuery({
    queryKey: ["omni-search", hostId, q],
    enabled: open && !!hostId && q.length >= 2,
    queryFn: () => searchFn({ data: { hostId: hostId!, q } }),
    staleTime: 30_000,
  });

  // What Latchkey itself has, for this person (admin-only things for super admins only).
  const builtIn = useMemo<SearchHit[]>(() => {
    const out: SearchHit[] = [];
    for (const p of pages) out.push({ kind: "page", id: `page-${p.id}`, title: p.label, href: p.href, keywords: copy.pageWords[p.id] ?? "" });
    out.push(
      { kind: "page", id: "page-register", title: hostNav.register, href: "/app/register", keywords: "guests record passport nationality" },
      { kind: "page", id: "page-activity", title: hostNav.activity, href: "/app/activity", keywords: "history audit team changes" },
      { kind: "page", id: "page-whats-new", title: whatsNewCopy.navLabel, href: "/app/whats-new", keywords: "changes releases updates" },
      { kind: "page", id: "page-billing", title: billingCopy.navLabel, href: "/app/billing", keywords: "subscription plan card payment invoice trial" },
    );
    if (superAdmin) out.push({ kind: "page", id: "page-admin", title: adminCopy.navLabel, href: "/app/admin", keywords: "super admin pricing site settings brand" });
    for (const [id, [label, group]] of Object.entries(settingsRailCopy.sections)) {
      if (ADMIN_SETTINGS.has(id) && !superAdmin) continue;
      out.push({ kind: "setting", id: `setting-${id}`, title: label, subtitle: `${copy.settings} · ${settingsRailCopy.groups[group] ?? ""}`, href: `/app/settings?focus=${id}`, keywords: copy.settingWords[id] ?? "" });
    }
    for (const s of SECTIONS) out.push({ kind: "guide", id: `section-${s.key}`, title: s.title, subtitle: copy.guideSection, href: `/app/guides?section=${s.key}`, keywords: s.hint });
    out.push({ kind: "guide", id: "guide-tiles", title: copy.quickTiles, subtitle: copy.guides, href: "/app/guides", keywords: "tiles shortcuts buttons top of guide" });
    for (const r of releasesFor({ admin: superAdmin }))
      for (const [i, it] of r.items.entries())
        if (it.kind === "new") out.push({ kind: "feature", id: `feature-${r.version}-${i}`, title: it.text.split(/[.:(]/)[0]!.slice(0, 90), subtitle: `${it.area} · ${r.version}`, href: AREA_PAGES[it.area] ?? "/app/whats-new", keywords: it.text });
    out.push({ kind: "logo", id: "logo-own", title: copy.yourLogo, subtitle: themeStudio.logo, href: "/app/settings?focus=theme", keywords: "logo upload brand mark icon" });
    for (const [key, name] of Object.entries(themeStudio.logoNames)) out.push({ kind: "logo", id: `logo-${key}`, title: name, subtitle: copy.logoChoice, href: "/app/settings?focus=theme", keywords: "logo" });
    if (superAdmin) {
      out.push({ kind: "logo", id: "logo-site", title: copy.siteLogo, subtitle: adminCopy.navLabel, href: "/app/admin", keywords: "logo brand favicon app icon white label" });
      for (const k of INTEGRATION_KEYS) out.push({ kind: "integration", id: `int-${k}`, title: integrationsCopy.items[k].name, subtitle: copy.demoLive, href: "/app/settings?focus=integrations", keywords: "integration demo live switch" });
    }
    return out;
  }, [pages, superAdmin]);

  const hits = useMemo(() => {
    if (cleanQuery(text).length < 1) return [];
    return [...rankHits(text, builtIn, 12), ...(remote.data?.hits ?? [])];
  }, [text, builtIn, remote.data]);

  function go(h: SearchHit) {
    setOpen(false);
    setText("");
    if (h.propertyId) select(h.propertyId);
    if (/^https:/.test(h.href)) window.open(h.href, "_blank", "noopener");
    else void navigate({ href: h.href });
  }

  return (
    <>
      <button
        type="button"
        aria-label={copy.open}
        title={copy.openHint}
        onClick={() => setOpen(true)}
        className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground", className)}
      >
        <Search className="size-5" />
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setText("");
        }}
      >
        <DialogContent className="top-[12%] w-[calc(100vw-1.5rem)] max-w-xl translate-y-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{copy.title}</DialogTitle>
          <DialogDescription className="sr-only">{copy.placeholder}</DialogDescription>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5">
            <CommandInput value={text} onValueChange={setText} placeholder={copy.placeholder} />
            <CommandList className="max-h-[min(60dvh,28rem)]">
              {text.trim() ? (
                <CommandEmpty>{remote.isFetching ? <Loader2 className="mx-auto size-5 animate-spin" /> : copy.empty}</CommandEmpty>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">{copy.hint}</p>
              )}
              {GROUPS.map((g) => {
                const list = hits.filter((h) => g.kinds.includes(h.kind));
                if (!list.length) return null;
                return (
                  <CommandGroup key={g.key} heading={copy.groups[g.key]}>
                    {list.map((h) => {
                      const Icon = ICONS[h.kind] ?? CalendarDays;
                      return (
                        <CommandItem key={`${h.kind}-${h.id}`} value={`${h.kind}-${h.id}`} onSelect={() => go(h)} className="gap-3 rounded-xl data-[selected=true]:bg-secondary data-[selected=true]:text-foreground">
                          <Icon className="size-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{h.title}</span>
                            {h.subtitle ? <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span> : null}
                          </span>
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{copy.kinds[h.kind]}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })}
              {remote.isFetching && hits.length ? <p className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> {copy.searching}</p> : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
