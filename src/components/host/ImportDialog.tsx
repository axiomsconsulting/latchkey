import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bookings as copy, channels, common } from "@/content/copy";
import { importBookings } from "@/lib/host.functions";
import { guessMapping, IMPORT_FIELDS, normaliseDate, parseCsv, type ImportFieldKey } from "@/lib/csv";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  rooms: Array<{ id: string; display_name: string }>;
};

const CHANNEL_KEYS = ["airbnb", "booking_com", "homestay", "direct", "other"] as const;

export function ImportDialog({ open, onOpenChange, propertyId, rooms }: Props) {
  const run = useServerFn(importBookings);
  const qc = useQueryClient();
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<ImportFieldKey, number>>>({});
  const [busy, setBusy] = useState(false);

  const headers = rows[0] ?? [];
  const body = rows.slice(1);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    setMapping(guessMapping(parsed[0] ?? []));
  }

  function cell(row: string[], key: ImportFieldKey): string {
    const idx = mapping[key];
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  }

  function buildRows() {
    const roomByName = new Map(rooms.map((r) => [r.display_name.toLowerCase(), r.id]));
    const out: Array<Record<string, unknown>> = [];
    const problems: string[] = [];

    body.forEach((row, i) => {
      const checkIn = normaliseDate(cell(row, "check_in_date"));
      const checkOut = normaliseDate(cell(row, "check_out_date"));
      if (!checkIn || !checkOut) {
        problems.push(`Row ${i + 2}: the dates could not be read.`);
        return;
      }
      const channelRaw = cell(row, "channel").toLowerCase().replace(/[^a-z]/g, "");
      const channel =
        channelRaw.includes("airbnb")
          ? "airbnb"
          : channelRaw.includes("booking")
            ? "booking_com"
            : channelRaw.includes("homestay")
              ? "homestay"
              : channelRaw.includes("direct")
                ? "direct"
                : "other";
      const phone = cell(row, "phone_last4").replace(/\D/g, "").slice(-4);
      out.push({
        room_id: roomByName.get(cell(row, "room").toLowerCase()) ?? null,
        channel,
        guest_full_name: cell(row, "guest_full_name") || null,
        reservation_code: cell(row, "reservation_code") || null,
        guest_count: Number(cell(row, "guest_count")) || 1,
        phone_last4: phone.length === 4 ? phone : null,
        check_in_date: checkIn,
        check_out_date: checkOut,
        notes: cell(row, "notes") || null,
      });
    });

    return { out, problems };
  }

  async function onImport() {
    const { out, problems } = buildRows();
    if (out.length === 0) {
      toast.error(problems[0] ?? "There was nothing to import.");
      return;
    }
    setBusy(true);
    try {
      const result = await run({ data: { property_id: propertyId, rows: out as never } });
      await qc.invalidateQueries({ queryKey: ["board"] });
      toast.success(`${result.imported} ${copy.importedToast}`);
      if (problems.length > 0) toast.warning(`${problems.length} rows were skipped.`);
      setRows([]);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{copy.importTitle}</DialogTitle>
          <DialogDescription>{copy.importBody}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label htmlFor="csv" className="mb-2 block">
              {copy.importChoose}
            </Label>
            <input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="block w-full rounded-xl border border-input bg-surface p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:text-secondary-foreground"
            />
          </div>

          {headers.length > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {IMPORT_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label>{f.label}</Label>
                    <Select
                      value={mapping[f.key] === undefined ? "none" : String(mapping[f.key])}
                      onValueChange={(v) =>
                        setMapping((m) => ({
                          ...m,
                          [f.key]: v === "none" ? undefined : Number(v),
                        }))
                      }
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not in this file</SelectItem>
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

              <div className="rounded-xl border border-border bg-surface p-4 text-sm">
                <p className="font-medium">Preview</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {buildRows()
                    .out.slice(0, 3)
                    .map((r, i) => (
                      <li key={i}>
                        {(r["guest_full_name"] as string) ?? copy.guestUnknown} ·{" "}
                        {r["check_in_date"] as string} → {r["check_out_date"] as string} ·{" "}
                        {channels[r["channel"] as (typeof CHANNEL_KEYS)[number]]}
                      </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  {buildRows().out.length} bookings ready, {buildRows().problems.length} skipped.
                </p>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common.cancel}
          </Button>
          <Button type="button" onClick={onImport} disabled={busy || headers.length === 0}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {copy.importConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
