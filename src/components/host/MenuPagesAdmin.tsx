import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  LayoutList,
  Loader2,
  Menu as MenuIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { NAV_ICONS, NavIcon } from "@/components/NavIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { adminCopy, common, hostNav, menuAdminCopy as copy } from "@/content/copy";
import { useUi } from "@/hooks/use-site";
import { forgetSite } from "@/lib/site-client";
import { saveUiConfig } from "@/lib/site.functions";
import {
  MAX_ICON_DATA_URL,
  NAV_BUILT_INS,
  PAGES,
  cleanHref,
  normaliseUi,
  resolveNav,
  type NavEntry,
  type PageLayouts,
} from "@/lib/ui-config";
import { cn } from "@/lib/utils";

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
};

/** Any image the browser can draw, made into a 64 × 64 PNG (transparency kept). */
async function iconFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const scale = Math.min(64 / (img.naturalWidth || 64), 64 / (img.naturalHeight || 64));
    const w = (img.naturalWidth || 64) * scale;
    const h = (img.naturalHeight || 64) * scale;
    ctx.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const labels: Record<string, string> = {
  ...(hostNav as unknown as Record<string, string>),
  admin: adminCopy.navLabel,
};

/** Edits one of the super admin's own menu items. */
function ItemEditor({
  entry,
  onDone,
  onCancel,
}: {
  entry: NavEntry;
  onDone: (e: NavEntry) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(entry.label ?? "");
  const [kind, setKind] = useState<"app" | "web">(
    entry.href?.startsWith("https://") ? "web" : "app",
  );
  const [href, setHref] = useState(entry.href ?? "/app/");
  const [icon, setIcon] = useState(entry.icon ?? "link");
  const [iconUrl, setIconUrl] = useState<string | undefined>(entry.iconUrl);
  const [iconColour, setIconColour] = useState(!!entry.iconColour);
  const file = useRef<HTMLInputElement | null>(null);
  const ok =
    !!label.trim() &&
    !!cleanHref(href) &&
    (kind === "web" ? href.startsWith("https://") : href.startsWith("/"));

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`l-${entry.id}`}>{copy.label}</Label>
          <Input
            id={`l-${entry.id}`}
            className="h-10"
            maxLength={30}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>{copy.linkKind}</Label>
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v as "app" | "web");
              setHref(v === "web" ? "https://" : "/app/");
            }}
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="app">{copy.inApp}</SelectItem>
              <SelectItem value="web">{copy.external}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`h-${entry.id}`}>{kind === "web" ? copy.url : copy.path}</Label>
        <Input
          id={`h-${entry.id}`}
          className="h-10 font-mono"
          value={href}
          onChange={(e) => setHref(e.target.value.trim())}
          spellCheck={false}
          autoCapitalize="none"
        />
      </div>
      <div className="space-y-2">
        <Label>{copy.icon}</Label>
        <div className="flex flex-wrap gap-1">
          {Object.keys(NAV_ICONS).map((k) => (
            <button
              key={k}
              type="button"
              title={k}
              aria-label={k}
              aria-pressed={!iconUrl && icon === k}
              onClick={() => {
                setIcon(k);
                setIconUrl(undefined);
              }}
              className={cn(
                "grid size-10 place-items-center rounded-lg border",
                !iconUrl && icon === k
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent hover:bg-secondary",
              )}
            >
              <NavIcon icon={k} />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <input
            ref={file}
            type="file"
            accept="image/png,image/svg+xml,image/webp"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const data = await iconFromFile(f);
                if (data.length > MAX_ICON_DATA_URL) return void toast.error(copy.iconTooBig);
                setIconUrl(data);
              } catch {
                toast.error(copy.iconBad);
              } finally {
                e.target.value = "";
              }
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => file.current?.click()}>
            <Upload className="size-4" /> {copy.upload}
          </Button>
          {iconUrl ? (
            <>
              <span className="grid size-10 place-items-center rounded-lg border border-primary bg-primary/10 text-primary">
                <NavIcon icon="link" iconUrl={iconUrl} iconColour={iconColour} />
              </span>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={iconColour} onCheckedChange={setIconColour} /> {copy.keepColours}
              </label>
            </>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{copy.uploadHelp}</p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!ok}
          onClick={() =>
            onDone({
              id: entry.id,
              label: label.trim(),
              href,
              icon,
              ...(iconUrl ? { iconUrl, ...(iconColour ? { iconColour: true } : {}) } : {}),
              ...(entry.hidden ? { hidden: true } : {}),
            })
          }
        >
          {copy.done}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {copy.cancel}
        </Button>
      </div>
      {!ok ? <p className="text-xs text-muted-foreground">{copy.needLabel}</p> : null}
    </div>
  );
}

/**
 * Super admin: the menu and every page's sections, for all hosts. Order with
 * the arrows, show or hide with the eye, add their own items with icons.
 */
export function MenuPagesAdmin() {
  const ui = useUi();
  const save = useServerFn(saveUiConfig);
  const router = useRouter();
  const [nav, setNav] = useState<NavEntry[]>(ui.nav);
  const [pages, setPages] = useState<PageLayouts>(ui.pages);
  const [editing, setEditing] = useState<string | null>(null);
  const [page, setPage] = useState<string>("today");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNav(ui.nav);
    setPages(ui.pages);
  }, [ui]);

  const rows = resolveNav(nav, labels, { superAdmin: true, includeHidden: true });
  // Menu and page layouts save together; editing an item finishes first.
  const dirty = !editing && changed({ nav, pages }, { nav: ui.nav, pages: ui.pages });
  const layout = pages[page] ?? { order: [], hidden: [] };
  const sections = PAGES[page]?.sections ?? [];

  async function saveAll() {
    setBusy(true);
    try {
      await save({ data: normaliseUi({ nav, pages }) });
      forgetSite();
      await router.invalidate();
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const iconBtn =
    "grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40";

  return (
    <div className="space-y-6">
      <section className="card-soft space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-lg">
              <MenuIcon className="size-5 text-primary" /> {copy.menuTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{copy.menuHelp}</p>
          </div>
          <SaveButton dirty={dirty} busy={busy} label={copy.save} onClick={() => void saveAll()} />
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r, i) => {
            const entry = nav.find((e) => e.id === r.id)!;
            const hidden = !!entry.hidden;
            return (
              <li key={r.id} className="space-y-3 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-lg bg-secondary",
                      hidden && "opacity-50",
                    )}
                  >
                    <NavIcon icon={r.icon} iconUrl={r.iconUrl} iconColour={r.iconColour} />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      hidden && "text-muted-foreground line-through",
                    )}
                  >
                    {r.label}
                  </span>
                  {r.locked ? <Badge variant="secondary">{copy.always}</Badge> : null}
                  {!r.builtIn ? <Badge variant="outline">{copy.yours}</Badge> : null}
                  {hidden ? <Badge variant="outline">{copy.hiddenBadge}</Badge> : null}
                  <button
                    type="button"
                    className={iconBtn}
                    disabled={i === 0}
                    aria-label={copy.up(r.label)}
                    onClick={() =>
                      setNav((n) =>
                        move(
                          n,
                          n.findIndex((x) => x.id === r.id),
                          n.findIndex((x) => x.id === r.id) - 1,
                        ),
                      )
                    }
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    disabled={i === rows.length - 1}
                    aria-label={copy.down(r.label)}
                    onClick={() =>
                      setNav((n) =>
                        move(
                          n,
                          n.findIndex((x) => x.id === r.id),
                          n.findIndex((x) => x.id === r.id) + 1,
                        ),
                      )
                    }
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    disabled={r.locked}
                    aria-label={hidden ? copy.show(r.label) : copy.hide(r.label)}
                    title={r.locked ? copy.always : undefined}
                    onClick={() =>
                      setNav((n) => n.map((x) => (x.id === r.id ? { ...x, hidden: !x.hidden } : x)))
                    }
                  >
                    {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  {!r.builtIn ? (
                    <>
                      <button
                        type="button"
                        className={iconBtn}
                        aria-label={`${copy.edit} ${r.label}`}
                        onClick={() => setEditing(r.id)}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        className={cn(iconBtn, "hover:text-destructive")}
                        aria-label={`${copy.remove} ${r.label}`}
                        onClick={() => setNav((n) => n.filter((x) => x.id !== r.id))}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  ) : null}
                </div>
                {editing === r.id ? (
                  <ItemEditor
                    entry={entry}
                    onCancel={() => setEditing(null)}
                    onDone={(e) => {
                      setNav((n) => n.map((x) => (x.id === e.id ? e : x)));
                      setEditing(null);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
          {editing && !nav.some((e) => e.id === editing) ? (
            <li className="px-3 py-3">
              <ItemEditor
                entry={{ id: editing, label: "", href: "/app/", icon: "link" }}
                onCancel={() => setEditing(null)}
                onDone={(e) => {
                  setNav((n) => [...n, e]);
                  setEditing(null);
                }}
              />
            </li>
          ) : null}
        </ul>
        <Button
          variant="outline"
          disabled={
            !!editing || nav.filter((e) => !NAV_BUILT_INS.some((b) => b.id === e.id)).length >= 12
          }
          onClick={() => setEditing(`custom_${Math.random().toString(36).slice(2, 10)}`)}
        >
          <Plus className="size-4" /> {copy.add}
        </Button>
      </section>

      <section className="card-soft space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-lg">
              <LayoutList className="size-5 text-primary" /> {copy.pagesTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{copy.pagesHelp}</p>
          </div>
          <SaveButton dirty={dirty} busy={busy} label={copy.save} onClick={() => void saveAll()} />
        </div>
        <div className="space-y-1">
          <Label>{copy.page}</Label>
          <Select value={page} onValueChange={setPage}>
            <SelectTrigger className="h-10 w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAGES).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {layout.order.map((id, i) => {
            const sec = sections.find((x) => x.id === id);
            if (!sec) return null;
            const hidden = layout.hidden.includes(id);
            const set = (next: { order?: string[]; hidden?: string[] }) =>
              setPages((p) => ({ ...p, [page]: { ...layout, ...next } }));
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-2">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    hidden && "text-muted-foreground line-through",
                  )}
                >
                  {sec.label}
                </span>
                {sec.locked ? <Badge variant="secondary">{copy.always}</Badge> : null}
                {hidden ? <Badge variant="outline">{copy.hiddenBadge}</Badge> : null}
                <button
                  type="button"
                  className={iconBtn}
                  disabled={i === 0}
                  aria-label={copy.up(sec.label)}
                  onClick={() => set({ order: move(layout.order, i, i - 1) })}
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  disabled={i === layout.order.length - 1}
                  aria-label={copy.down(sec.label)}
                  onClick={() => set({ order: move(layout.order, i, i + 1) })}
                >
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  disabled={sec.locked}
                  aria-label={hidden ? copy.show(sec.label) : copy.hide(sec.label)}
                  onClick={() =>
                    set({
                      hidden: hidden
                        ? layout.hidden.filter((x) => x !== id)
                        : [...layout.hidden, id],
                    })
                  }
                >
                  {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
