import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BadgePercent, Check, ChevronDown, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { voucherCopy as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { money } from "@/lib/direct-rates";
import { checkVoucher } from "@/lib/vouchers.functions";
import { normaliseCode, periodsText, type NightPrice, type Voucher } from "@/lib/vouchers";

export type AppliedVoucher = Pick<Voucher, "code" | "kind" | "value" | "roomIds" | "periods">;

/**
 * The booking form's Loyalty voucher: a code field (filled from the link's
 * ?voucher=), checked for the booker's name, rooms and dates; once applied,
 * each room's price per night, voucher nights marked.
 */
export function VoucherBox({
  pageCode,
  initial,
  name,
  onName,
  roomIds,
  checkIn,
  checkOut,
  currency,
  applied,
  onApplied,
  breakdown,
}: {
  pageCode: string;
  initial: string | null;
  name: string;
  onName: (v: string) => void;
  roomIds: string[];
  checkIn: string;
  checkOut: string;
  currency: string;
  applied: AppliedVoucher | null;
  onApplied: (v: AppliedVoucher | null) => void;
  breakdown: Array<{ room: string; nights: NightPrice[] }>;
}) {
  const check = useServerFn(checkVoucher);
  const [open, setOpen] = useState(!!initial);
  const [code, setCode] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function apply() {
    if (normaliseCode(code).length < 4) return setNote(copy.enterCode);
    if (name.trim().length < 2) return setNote(copy.needName);
    setBusy(true);
    setNote(null);
    try {
      const r = await check({
        data: { code: pageCode, voucher: normaliseCode(code), name, roomIds, checkIn, checkOut },
      });
      if (!r.ok) {
        onApplied(null);
        setNote(r.problem);
      } else {
        onApplied(r.voucher);
        setNote(r.problem ? `${r.problem} ${copy.when(periodsText(r.voucher.periods))}` : null);
      }
    } catch {
      setNote(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  // Applied from the link once the booker's name is there.
  useEffect(() => {
    if (initial && !applied && name.trim().length >= 2 && roomIds.length) void apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, roomIds.join(","), checkIn, checkOut]);

  if (applied)
    return (
      <div className="space-y-2 rounded-xl border border-success/40 bg-success/10 p-3 text-sm">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium">{copy.applied(applied.code)}</span>{" "}
            {copy.worth(
              applied.kind === "percent" ? `${applied.value}%` : money(applied.value, currency),
              applied.kind,
              periodsText(applied.periods),
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              onApplied(null);
              setNote(null);
            }}
            aria-label={copy.remove}
            className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        {note ? <p className="text-xs">{note}</p> : null}
        {breakdown.some((b) => b.nights.some((n) => n.voucher)) ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium [&::-webkit-details-marker]:hidden">
              {copy.perNight}
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            {breakdown.map((b) => (
              <div key={b.room} className="mt-2">
                {breakdown.length > 1 ? <p className="text-xs font-medium">{b.room}</p> : null}
                <ul className="max-h-48 overflow-y-auto text-xs">
                  {b.nights.map((n) => (
                    <li key={n.date} className="flex justify-between gap-2 py-0.5">
                      <span>{formatUkDate(n.date)}</span>
                      <span className="tabular-nums">
                        {money(n.price, currency)}
                        {n.voucher ? <span className="ml-1 text-success">●</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-1 text-[11px] text-muted-foreground">{copy.dotNote}</p>
          </details>
        ) : null}
      </div>
    );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-medium underline-offset-2 hover:underline"
      >
        <BadgePercent className="size-4 text-accent" aria-hidden /> {copy.have}
      </button>
    );

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <BadgePercent className="size-4 text-accent" aria-hidden /> {copy.title}
      </p>
      {name.trim().length < 2 ? (
        <Input
          aria-label={copy.nameLabel}
          placeholder={copy.nameLabel}
          autoComplete="name"
          value={name}
          onChange={(e) => onName(e.target.value)}
        />
      ) : null}
      <div className="flex gap-2">
        <Input
          aria-label={copy.codeLabel}
          placeholder="STAY-XXXXXX"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void apply();
            }
          }}
          className="font-mono"
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => void apply()}>
          {busy ? <Loader2 className="animate-spin" /> : null} {copy.apply}
        </Button>
      </div>
      {note ? (
        <p role="alert" className="text-xs text-destructive">
          {note}
        </p>
      ) : null}
    </div>
  );
}
