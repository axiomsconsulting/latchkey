import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { ChannelIcon } from "@/components/ChannelIcon";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { bookingSitesAdminCopy as copy, channels, common } from "@/content/copy";
import {
  BUILT_IN_SITES,
  cleanDomains,
  type BuiltInSite,
  type PlatformSites,
} from "@/lib/booking-sites";
import { getBookingSitesSettings, saveBookingSitesSettings } from "@/lib/site.functions";
import { toIcon } from "@/lib/site-icon";

/** The rows as typed: web addresses stay as one line of text until saved. */
type Form = Record<BuiltInSite, { label: string; iconUrl: string | null; domains: string }>;

const toForm = (p: PlatformSites): Form =>
  Object.fromEntries(
    BUILT_IN_SITES.map((k) => [k, { ...p[k], domains: p[k].domains.join(", ") }]),
  ) as Form;

/**
 * Latchkey admin → Site: what the built-in booking sites are called for every host,
 * their logos, and what their calendar links must contain (airbnb, say), which catches
 * a link pasted under the wrong site and picks the right site when one is pasted.
 */
export function BookingSitesAdmin() {
  const fn = useServerFn(getBookingSitesSettings);
  const saveFn = useServerFn(saveBookingSitesSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-booking-sites"], queryFn: () => fn() });
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const fileFor = useRef<BuiltInSite | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (q.data) setForm(toForm(q.data.sites));
  }, [q.data]);
  if (!q.data || !form) return <Skeleton className="h-64 rounded-2xl" />;
  const set = (k: BuiltInSite, patch: Partial<Form[BuiltInSite]>) =>
    setForm((f) => f && { ...f, [k]: { ...f[k], ...patch } });

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await saveFn({
        data: {
          sites: Object.fromEntries(
            BUILT_IN_SITES.map((k) => [
              k,
              {
                label: form[k].label.trim(),
                icon_url: form[k].iconUrl,
                domains: cleanDomains(form[k].domains),
              },
            ]),
          ),
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-booking-sites"] }),
        qc.invalidateQueries({ queryKey: ["workspace"] }),
      ]);
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <SaveButton
          dirty={changed(form, toForm(q.data.sites))}
          busy={busy}
          onClick={() => void save()}
        />
      </div>
      {!q.data.available ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{copy.notReady}</p>
      ) : null}
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.ico"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const k = fileFor.current;
          if (f && k)
            void toIcon(f).then(
              (iconUrl) => set(k, { iconUrl }),
              (err: unknown) => toast.error(err instanceof Error ? err.message : common.errorBody),
            );
          e.target.value = "";
        }}
      />
      <ul className="divide-y divide-border">
        {BUILT_IN_SITES.map((k) => {
          const standard = (channels as Record<string, string>)[k] ?? k;
          const name = form[k].label || standard;
          return (
            <li key={k} className="flex flex-wrap items-end gap-3 py-3">
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label={copy.logo(name)}
                  title={copy.logo(name)}
                  className="relative rounded-[22%]"
                  onClick={() => {
                    fileFor.current = k;
                    file.current?.click();
                  }}
                >
                  <ChannelIcon channel={k} iconUrl={form[k].iconUrl} label={name} size={44} />
                  <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border border-border bg-background">
                    <ImagePlus className="size-3 text-muted-foreground" />
                  </span>
                </button>
                {form[k].iconUrl ? (
                  <button
                    type="button"
                    aria-label={copy.removeLogo(name)}
                    title={copy.removeLogo(name)}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => set(k, { iconUrl: null })}
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 basis-40 space-y-1">
                <Label htmlFor={`bs-${k}`} className="text-xs">
                  {copy.name}
                </Label>
                <Input
                  id={`bs-${k}`}
                  maxLength={40}
                  placeholder={standard}
                  value={form[k].label}
                  onChange={(e) => set(k, { label: e.target.value })}
                />
              </div>
              <div className="min-w-0 flex-1 basis-52 space-y-1">
                <Label htmlFor={`bd-${k}`} className="text-xs">
                  {copy.domains}
                </Label>
                <Input
                  id={`bd-${k}`}
                  placeholder={copy.domainsNone}
                  value={form[k].domains}
                  onChange={(e) => set(k, { domains: e.target.value })}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{copy.domainsHelp}</p>
    </section>
  );
}
