import { Fragment, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Download, IdCard, Loader2, NotebookPen, Plus, Printer } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/host/EmptyState";
import { RegisterStayDetails } from "@/components/host/RegisterStayDetails";
import { PageHeader } from "@/components/host/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { common, guest as guestCopy, registerPage as copy } from "@/content/copy";
import { useRole, useWorkspace } from "@/hooks/use-host-data";
import { addDays, formatUkDate } from "@/lib/dates";
import { cleanRegisterEntry, isAlien, nationalityName, nationalityOptions, registerApplies } from "@/lib/hotel-register";
import { exportRegister, listRegister, saveRegisterEntry, type RegisterRow } from "@/lib/register.functions";
import { rebrand } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/app/register")({
  head: () => ({ meta: [{ title: rebrand("Guest register · Latchkey host dashboard") }] }),
  component: RegisterPage,
});

type Property = { id: string; name: string; country_code?: string | null };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function RegisterPage() {
  const workspace = useWorkspace();
  const { canWrite, loading } = useRole();
  const list = useServerFn(listRegister);
  const exportFn = useServerFn(exportRegister);
  const hostId = workspace.data?.hostId ?? "";
  const properties = ((workspace.data?.properties ?? []) as Property[]).filter((p) => registerApplies(p.country_code));
  const [propertyId, setPropertyId] = useState<string>("all");
  const [from, setFrom] = useState(() => addDays(today(), -30));
  const [to, setTo] = useState(today);
  const [editing, setEditing] = useState<RegisterRow | "new" | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Stays whose ID photos and check-in details are open under their entries.
  const [openStays, setOpenStays] = useState<Set<string>>(() => new Set());
  const toggleStay = (id: string) =>
    setOpenStays((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const range = { hostId, from, to, propertyId: propertyId === "all" ? null : propertyId };
  const rows = useQuery({
    queryKey: ["register", range],
    enabled: !!hostId && canWrite && from <= to,
    queryFn: () => list({ data: range }),
  });

  async function download() {
    setDownloading(true);
    try {
      const res = await exportFn({ data: range });
      const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `guest-register-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(copy.downloaded(res.count));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setDownloading(false);
    }
  }

  if (loading || workspace.isLoading) return <Skeleton className="mx-auto h-64 max-w-5xl rounded-2xl" />;
  if (!canWrite) return <EmptyState icon={NotebookPen} title={copy.title} body={copy.staffOnly} />;
  if (properties.length === 0) return <EmptyState icon={NotebookPen} title={copy.title} body={copy.notUk} />;

  const data = rows.data?.rows ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={() => void download()} disabled={downloading}>
              {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {copy.download}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> {copy.print}
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> {copy.add}
            </Button>
          </div>
        }
      />
      <p className="rounded-xl bg-muted p-3 text-sm print:hidden">{copy.law}</p>

      <div className="card-soft grid gap-3 p-4 sm:grid-cols-3 print:hidden">
        <div className="space-y-1">
          <Label htmlFor="reg-prop">{copy.property}</Label>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger id="reg-prop" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.allProperties}</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="reg-from">{copy.from}</Label>
          <Input id="reg-from" type="date" className="h-11" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reg-to">{copy.to}</Label>
          <Input id="reg-to" type="date" className="h-11" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {rows.isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : rows.error ? (
        <p className="card-soft p-6 text-muted-foreground">{rows.error instanceof Error ? rows.error.message : common.errorBody}</p>
      ) : data.length === 0 ? (
        <div className="card-soft p-8 text-center text-muted-foreground">{copy.empty}</div>
      ) : (
        <section className="card-soft overflow-x-auto p-0">
          <p className="px-4 pt-4 text-sm text-muted-foreground">
            {copy.count(data.length)} · {formatUkDate(from, { withYear: true })} – {formatUkDate(to, { withYear: true })}
          </p>
          <table className="mt-2 w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{copy.colArrived}</th>
                <th className="px-4 py-2 font-medium">{copy.colName}</th>
                <th className="px-4 py-2 font-medium">{copy.colNationality}</th>
                <th className="px-4 py-2 font-medium">{copy.colDocument}</th>
                <th className="px-4 py-2 font-medium">{copy.colNext}</th>
                <th className="px-4 py-2 font-medium">{copy.colWhere}</th>
                <th className="px-4 py-2 print:hidden" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r, i) => (
                <Fragment key={r.id}>
                <tr className="align-top">
                  <td className="whitespace-nowrap px-4 py-3">{formatUkDate(r.arrival_date, { withYear: true })}</td>
                  <td className="px-4 py-3 font-medium">
                    {r.full_name}
                    {r.source === "host" ? <span className="block text-xs font-normal text-muted-foreground">{copy.byHost}</span> : null}
                  </td>
                  <td className="px-4 py-3">{nationalityName(r.nationality)}</td>
                  <td className="px-4 py-3">
                    {r.document_number ? (
                      <>
                        {r.document_number}
                        <span className="block text-xs text-muted-foreground">{copy.issuedAt(r.place_of_issue ?? "")}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.next_destination ?? "—"}
                    {r.next_address ? <span className="block text-xs text-muted-foreground">{r.next_address}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.property_name}
                    {r.room_name ? <span className="block text-xs text-muted-foreground">{r.room_name}</span> : null}
                  </td>
                  <td className="px-4 py-3 print:hidden">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                      {copy.edit}
                    </Button>
                  </td>
                </tr>
                {/* After a stay's last entry: its ID photos and everything captured at check-in. */}
                {r.booking_id && data[i + 1]?.booking_id !== r.booking_id ? (
                  <tr className="print:hidden">
                    <td colSpan={7} className="px-4 pb-3 pt-0">
                      <Button variant="link" size="sm" className="h-8 gap-1.5 px-0" aria-expanded={openStays.has(r.booking_id)} onClick={() => toggleStay(r.booking_id!)}>
                        <IdCard className="size-4" /> {openStays.has(r.booking_id) ? copy.hideDetails : copy.stayDetails}
                        <ChevronDown className={`size-4 transition-transform ${openStays.has(r.booking_id) ? "rotate-180" : ""}`} />
                      </Button>
                      {openStays.has(r.booking_id) ? (
                        <div className="mt-2 rounded-xl border border-border bg-muted/30 p-4">
                          <RegisterStayDetails bookingId={r.booking_id} />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {editing ? (
        <EntryDialog
          row={editing === "new" ? null : editing}
          properties={properties}
          defaultPropertyId={propertyId === "all" ? (properties[0]?.id ?? "") : propertyId}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function EntryDialog({
  row,
  properties,
  defaultPropertyId,
  onClose,
}: {
  row: RegisterRow | null;
  properties: Property[];
  defaultPropertyId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveRegisterEntry);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    propertyId: row?.property_id ?? defaultPropertyId,
    arrivalDate: row?.arrival_date ?? today(),
    roomName: row?.room_name ?? "",
    fullName: row?.full_name ?? "",
    nationality: row?.nationality ?? "",
    documentNumber: row?.document_number ?? "",
    placeOfIssue: row?.place_of_issue ?? "",
    nextDestination: row?.next_destination ?? "",
    nextAddress: row?.next_address ?? "",
  });
  useEffect(() => {
    if (!form.propertyId && defaultPropertyId) setForm((f) => ({ ...f, propertyId: defaultPropertyId }));
  }, [defaultPropertyId, form.propertyId]);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const alien = !!form.nationality && isAlien(form.nationality);
  const ready = !!form.propertyId && cleanRegisterEntry(form).ok;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await save({ data: { ...(row ? { id: row.id } : {}), ...form } });
      if (!res.ok) {
        toast.error(res.missing.map((m) => guestCopy.registerMissing[m]).join(" "));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["register"] });
      toast.success(copy.saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{row ? copy.dialogEdit : copy.dialogAdd}</DialogTitle>
          <DialogDescription>{row ? copy.keptUntil(formatUkDate(row.keep_until, { withYear: true })) : copy.dialogHelp}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="e-prop">{copy.property}</Label>
              <Select value={form.propertyId} onValueChange={(v) => set("propertyId", v)}>
                <SelectTrigger id="e-prop" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-arr">{copy.arrival}</Label>
              <Input id="e-arr" type="date" className="h-11" required value={form.arrivalDate} onChange={(e) => set("arrivalDate", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-room">{copy.room}</Label>
            <Input id="e-room" className="h-11" value={form.roomName} onChange={(e) => set("roomName", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-name">{guestCopy.registerName}</Label>
            <Input id="e-name" className="h-11" required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-nat">{guestCopy.registerNationality}</Label>
            <Select value={form.nationality} onValueChange={(v) => set("nationality", v)}>
              <SelectTrigger id="e-nat" className="h-11">
                <SelectValue placeholder={guestCopy.registerPick} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {nationalityOptions().map((o) => (
                  <SelectItem key={o.code} value={o.code}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {alien ? (
            <>
              <p className="rounded-xl bg-muted p-3 text-sm">{guestCopy.registerAlienWhy}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="e-doc">{guestCopy.registerDocNumber}</Label>
                  <Input id="e-doc" className="h-11 uppercase" value={form.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="e-place">{guestCopy.registerPlace}</Label>
                  <Input id="e-place" className="h-11" value={form.placeOfIssue} onChange={(e) => set("placeOfIssue", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-next">{guestCopy.registerNext}</Label>
                <Input id="e-next" className="h-11" value={form.nextDestination} onChange={(e) => set("nextDestination", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-addr">{guestCopy.registerAddress}</Label>
                <Input id="e-addr" className="h-11" value={form.nextAddress} onChange={(e) => set("nextAddress", e.target.value)} />
              </div>
            </>
          ) : null}
          <Button type="submit" disabled={busy || !ready}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {common.save}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
