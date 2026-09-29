import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { common, tradesCopy as copy } from "@/content/copy";
import { parseCsv } from "@/lib/csv";
import {
  TRADE_CATEGORIES,
  TRADE_IMPORT_FIELDS,
  contactLinks,
  guessTradeMapping,
  rowsToTrades,
  tradeCategoryLabel,
  type ParsedTrade,
  type TradeFieldKey,
} from "@/lib/trade-contacts";
import {
  addSuggestedTrade,
  deleteTrade,
  importTrades,
  listTrades,
  saveTrade,
  suggestPropertyTrades,
} from "@/lib/trades.functions";
import { directoryLinks } from "@/lib/trades";

type Trade = {
  id: string;
  name: string;
  company_name: string | null;
  category: string;
  phone: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  website: string | null;
  area: string | null;
  notes: string | null;
  is_preferred: boolean;
  source: string;
};

const EMPTY = {
  name: "",
  company_name: "",
  category: "cleaning",
  phone: "",
  whatsapp_phone: "",
  email: "",
  website: "",
  area: "",
  notes: "",
  is_preferred: false,
};

export function TradeContacts({
  hostId,
  propertyId,
  postcode,
  countryCode,
}: {
  hostId: string;
  propertyId: string;
  postcode: string;
  countryCode: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTrades);
  const saveFn = useServerFn(saveTrade);
  const removeFn = useServerFn(deleteTrade);
  const suggestFn = useServerFn(suggestPropertyTrades);
  const acceptFn = useServerFn(addSuggestedTrade);

  const [editing, setEditing] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{ category: string; role: string; why: string; searchTerm: string }>
  >([]);

  const q = useQuery({
    queryKey: ["trades", hostId, propertyId],
    queryFn: () => listFn({ data: { hostId, propertyId } }),
  });

  const save = useMutation({
    mutationFn: (v: typeof EMPTY & { id?: string }) =>
      saveFn({
        data: {
          id: v.id ?? null,
          hostId,
          propertyId,
          name: v.name,
          company_name: v.company_name || null,
          category: v.category,
          phone: v.phone || null,
          whatsapp_phone: v.whatsapp_phone || null,
          email: v.email || null,
          website: v.website || null,
          area: v.area || null,
          notes: v.notes || null,
          is_preferred: v.is_preferred,
        },
      }),
    onSuccess: async () => {
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["trades"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : common.errorBody),
  });

  const suggest = useMutation({
    mutationFn: (force: boolean) => suggestFn({ data: { propertyId, force } }),
    onSuccess: (res) => {
      setSuggestions(res.suggestions);
      if (res.suggestions.length === 0) toast.message(copy.suggestDone);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : common.errorBody),
  });

  const accept = useMutation({
    mutationFn: (s: { category: string; role: string; why: string }) =>
      acceptFn({ data: { hostId, propertyId, category: s.category, role: s.role, why: s.why } }),
    onSuccess: async (_r, s) => {
      setSuggestions((prev) => prev.filter((x) => x.role !== s.role));
      await qc.invalidateQueries({ queryKey: ["trades"] });
    },
  });

  const trades = (q.data ?? []) as Trade[];

  return (
    <div className="space-y-4">
      <div className="card-soft p-4">
        <p className="text-sm text-muted-foreground">{copy.blurb}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="size-4" /> {copy.add}
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" /> {copy.importCta}
          </Button>
          <Button variant="outline" disabled={suggest.isPending} onClick={() => suggest.mutate(suggestions.length > 0)}>
            {suggest.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {suggestions.length > 0 ? copy.suggestAgain : copy.suggestCta}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{copy.suggestBlurb}</p>
      </div>

      {suggestions.length > 0 ? (
        <section className="card-soft p-4">
          <h3 className="text-lg">{copy.suggestions}</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => {
              const link = directoryLinks(s.category, postcode, countryCode)[0];
              return (
                <li key={s.role} className="rounded-2xl border p-3">
                  <p className="font-medium">{s.role}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.why}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => accept.mutate(s)}>
                      {copy.suggestAdd}
                    </Button>
                    {link ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={link.search(s.searchTerm, postcode || "UK")} target="_blank" rel="noreferrer">
                          {copy.searchFor(s.role)} <ExternalLink className="size-4" />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {q.isLoading ? (
        <div className="card-soft h-32 animate-pulse" />
      ) : trades.length === 0 ? (
        <div className="card-soft p-8 text-center text-muted-foreground">{copy.empty}</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {trades.map((t) => (
            <TradeCard
              key={t.id}
              trade={t}
              countryCode={countryCode}
              onEdit={() =>
                setEditing({
                  id: t.id,
                  name: t.name,
                  company_name: t.company_name ?? "",
                  category: t.category,
                  phone: t.phone ?? "",
                  whatsapp_phone: t.whatsapp_phone ?? "",
                  email: t.email ?? "",
                  website: t.website ?? "",
                  area: t.area ?? "",
                  notes: t.notes ?? "",
                  is_preferred: t.is_preferred,
                })
              }
              onRemove={async () => {
                if (!window.confirm(copy.deleteConfirm)) return;
                await removeFn({ data: { id: t.id } });
                await qc.invalidateQueries({ queryKey: ["trades"] });
              }}
            />
          ))}
        </ul>
      )}

      {editing ? (
        <TradeForm
          value={editing}
          busy={save.isPending}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={() => save.mutate(editing)}
        />
      ) : null}

      {importOpen ? (
        <ImportDialog
          hostId={hostId}
          propertyId={propertyId}
          onClose={() => setImportOpen(false)}
          onDone={async () => {
            setImportOpen(false);
            await qc.invalidateQueries({ queryKey: ["trades"] });
          }}
        />
      ) : null}
    </div>
  );
}

function TradeCard({
  trade,
  countryCode,
  onEdit,
  onRemove,
}: {
  trade: Trade;
  countryCode: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const links = contactLinks(trade, countryCode);
  const any = links.tel || links.email || links.whatsapp;
  return (
    <li className="card-soft flex flex-col p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {trade.company_name || trade.name}
            {trade.is_preferred ? (
              <Badge variant="secondary" className="gap-1">
                <Star className="size-3 fill-accent text-accent" /> {copy.preferred}
              </Badge>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {[tradeCategoryLabel(trade.category), trade.company_name ? trade.name : null, trade.area]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {trade.notes ? <p className="mt-1 text-sm">{trade.notes}</p> : null}
        </div>
        <Button variant="ghost" size="icon" aria-label={copy.remove} onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {links.tel ? (
          <Button asChild size="sm" variant="outline">
            <a href={links.tel}>
              <Phone className="size-4" /> {copy.call}
            </a>
          </Button>
        ) : null}
        {links.sms ? (
          <Button asChild size="sm" variant="outline">
            <a href={links.sms}>
              <MessageSquare className="size-4" /> {copy.text}
            </a>
          </Button>
        ) : null}
        {links.whatsapp ? (
          <Button asChild size="sm" variant="outline">
            <a href={links.whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4" /> {copy.whatsapp}
            </a>
          </Button>
        ) : null}
        {links.email ? (
          <Button asChild size="sm" variant="outline">
            <a href={links.email}>
              <Mail className="size-4" /> {copy.email}
            </a>
          </Button>
        ) : null}
        {!any ? <p className="text-sm text-muted-foreground">{copy.noContact}</p> : null}
        <Button size="sm" variant="ghost" onClick={onEdit}>
          {copy.edit}
        </Button>
      </div>
    </li>
  );
}

function TradeForm({
  value,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  value: typeof EMPTY & { id?: string };
  busy: boolean;
  onChange: (v: typeof EMPTY & { id?: string }) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = (k: keyof typeof EMPTY, v: string | boolean) => onChange({ ...value, [k]: v });
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle>{value.id ? copy.edit : copy.add}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.fields.name} id="t-name">
            <Input id="t-name" value={value.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={copy.fields.company_name} id="t-co">
            <Input id="t-co" value={value.company_name} onChange={(e) => set("company_name", e.target.value)} />
          </Field>
          <Field label={copy.fields.category} id="t-cat">
            <Select value={value.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger id="t-cat" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRADE_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={copy.fields.phone} id="t-phone">
            <Input id="t-phone" inputMode="tel" value={value.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label={copy.fields.whatsapp_phone} id="t-wa">
            <Input id="t-wa" inputMode="tel" value={value.whatsapp_phone} onChange={(e) => set("whatsapp_phone", e.target.value)} />
          </Field>
          <Field label={copy.fields.email} id="t-email">
            <Input id="t-email" type="email" value={value.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label={copy.fields.area} id="t-area">
            <Input id="t-area" value={value.area} onChange={(e) => set("area", e.target.value)} />
          </Field>
          <Field label={copy.fields.website} id="t-web">
            <Input id="t-web" value={value.website} onChange={(e) => set("website", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={copy.fields.notes} id="t-notes">
              <Textarea id="t-notes" rows={2} value={value.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <Checkbox checked={value.is_preferred} onCheckedChange={(c) => set("is_preferred", c === true)} />
            <span>{copy.fields.is_preferred}</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {copy.cancel}
          </Button>
          <Button disabled={busy || !value.name.trim()} onClick={onSave}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ImportDialog({
  hostId,
  propertyId,
  onClose,
  onDone,
}: {
  hostId: string;
  propertyId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const importFn = useServerFn(importTrades);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<TradeFieldKey, number>>>({});
  const [busy, setBusy] = useState(false);

  const parsed: { trades: ParsedTrade[]; skipped: number } = useMemo(
    () => (rows.length ? rowsToTrades(rows, mapping) : { trades: [], skipped: 0 }),
    [rows, mapping],
  );

  async function onFile(file: File) {
    const text = await file.text();
    const table = parseCsv(text);
    const head = table[0] ?? [];
    setHeaders(head);
    setRows(table.slice(1));
    setMapping(guessTradeMapping(head));
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await importFn({
        data: { hostId, propertyId, rows: parsed.trades },
      });
      toast.success(copy.importPreview(res.added));
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle>{copy.importTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{copy.importBlurb}</p>

        <div className="space-y-1.5">
          <Label htmlFor="trade-csv">{copy.importChoose}</Label>
          <Input
            id="trade-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>

        {headers.length > 0 ? (
          <>
            <h4 className="font-medium">{copy.importMap}</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              {TRADE_IMPORT_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`map-${f.key}`}>{f.label}</Label>
                  <Select
                    value={mapping[f.key] === undefined ? "none" : String(mapping[f.key])}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [f.key]: v === "none" ? undefined : Number(v) }))
                    }
                  >
                    <SelectTrigger id={`map-${f.key}`} className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{copy.importIgnore}</SelectItem>
                      {headers.map((h, i) => (
                        <SelectItem key={`${h}-${i}`} value={String(i)}>
                          {h || `Column ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <p className="text-sm">{copy.importPreview(parsed.trades.length)}</p>
            {parsed.skipped > 0 ? (
              <p className="text-sm text-muted-foreground">{copy.importSkipped(parsed.skipped)}</p>
            ) : null}
            <ul className="max-h-40 overflow-y-auto rounded-xl border p-2 text-sm">
              {parsed.trades.slice(0, 20).map((t, i) => (
                <li key={i} className="py-1">
                  {t.name} · {tradeCategoryLabel(t.category)} · {t.phone ?? t.email}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button disabled={busy || parsed.trades.length === 0} onClick={confirm}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.importConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

