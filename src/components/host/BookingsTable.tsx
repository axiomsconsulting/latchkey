import { ArrowDown, ArrowUp, ChevronDown, Search } from "lucide-react";

import { ChannelIcon } from "@/components/ChannelIcon";
import { StatusBadge } from "@/components/host/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { bookings as bookingCopy, bookingTable as copy } from "@/content/copy";
import { GROUP_ORDER, nights, stayGroup, type ListBooking, type ListFilters, type SortKey, type StayGroup } from "@/lib/booking-list";
import { platformKey, type Site } from "@/lib/booking-sites";
import { formatUkDate, stayState } from "@/lib/dates";
import { formatMoney } from "@/lib/invoice";
import { cn } from "@/lib/utils";

type Option = { key: string; label: string };

/** A dropdown of tickboxes: ticked means shown. */
function ShowHide({
  label,
  options,
  hidden,
  onChange,
}: {
  label: string;
  options: Option[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
}) {
  const shown = options.length - options.filter((o) => hidden.includes(o.key)).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-11 gap-2", hidden.length && "border-primary")}>
          {label}
          <span className="rounded-full bg-secondary px-2 text-xs">
            {shown}/{options.length}
          </span>
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.key}
            checked={!hidden.includes(o.key)}
            // Keep the menu open so several can be ticked in one go.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? hidden.filter((h) => h !== o.key) : [...hidden, o.key])}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BookingFilters({
  filters,
  onChange,
  rooms,
  sites,
  shown,
  total,
}: {
  filters: ListFilters;
  onChange: (f: ListFilters) => void;
  rooms: Array<{ id: string; display_name: string }>;
  sites: Site[];
  shown: number;
  total: number;
}) {
  const groupOptions = GROUP_ORDER.map((g) => ({ key: g, label: copy.groups[g]! }));
  const roomOptions = [...rooms.map((r) => ({ key: r.id, label: r.display_name })), { key: "none", label: copy.noRoom }];
  const platformOptions = sites.map((s) => ({ key: s.key, label: s.label }));
  const pastShown = !filters.hideGroups.includes("past");
  const anyHidden = filters.hideGroups.length + filters.hideRooms.length + filters.hidePlatforms.length > 0 || filters.search;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          placeholder={copy.search}
          aria-label={copy.search}
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>
      <ShowHide label={copy.status} options={groupOptions} hidden={filters.hideGroups} onChange={(h) => onChange({ ...filters, hideGroups: h as StayGroup[] })} />
      <ShowHide label={copy.rooms} options={roomOptions} hidden={filters.hideRooms} onChange={(h) => onChange({ ...filters, hideRooms: h })} />
      <ShowHide label={copy.platforms} options={platformOptions} hidden={filters.hidePlatforms} onChange={(h) => onChange({ ...filters, hidePlatforms: h })} />
      <label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm">
        <Switch
          checked={pastShown}
          onCheckedChange={(on) =>
            onChange({ ...filters, hideGroups: on ? filters.hideGroups.filter((g) => g !== "past") : [...filters.hideGroups, "past"] })
          }
        />
        {copy.showPast}
      </label>
      <span className="text-sm text-muted-foreground">{copy.shown(shown, total)}</span>
      {anyHidden ? (
        <Button variant="link" className="h-auto p-0" onClick={() => onChange({ search: "", hideGroups: [], hideRooms: [], hidePlatforms: [] })}>
          {copy.clear}
        </Button>
      ) : null}
    </div>
  );
}

const COLUMNS: SortKey[] = ["guest", "room", "checkIn", "checkOut", "nights", "platform", "status", "amount"];

/**
 * Stays as a table on wider screens and as cards on phones, in the order
 * chosen. Group headings appear in the default order.
 */
export function BookingsTable({
  rows,
  today,
  rooms,
  sites,
  currency,
  sort,
  onSort,
  selecting,
  picked,
  onToggle,
  onOpen,
}: {
  rows: ListBooking[];
  today: string;
  rooms: Array<{ id: string; display_name: string }>;
  sites: Site[];
  currency: string;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (s: { key: SortKey; dir: "asc" | "desc" }) => void;
  selecting: boolean;
  picked: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return <div className="card-soft p-8 text-center text-muted-foreground">{copy.nothing}</div>;
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.display_name ?? copy.noRoom;
  const site = (b: ListBooking) => sites.find((s) => s.key === platformKey(b));
  const name = (b: ListBooking) => b.guest_full_name?.trim() || bookingCopy.guestUnknown;
  const grouped = sort.key === "smart";

  function header(key: SortKey) {
    const active = sort.key === key;
    const next = active && sort.dir === "asc" ? "desc" : "asc";
    return (
      <th key={key} className={cn("px-3 py-2 font-medium", (key === "nights" || key === "amount") && "text-right")}>
        <button
          type="button"
          onClick={() => onSort(active && sort.dir === "desc" ? { key: "smart", dir: "asc" } : { key, dir: next })}
          className="inline-flex items-center gap-1 hover:text-foreground"
          aria-label={copy.sortBy(copy.cols[key]!)}
          aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        >
          {copy.cols[key]}
          {active ? sort.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : null}
        </button>
      </th>
    );
  }

  let lastGroup: StayGroup | null = null;
  const sections = rows.map((b) => {
    const g = stayGroup(b, today);
    const heading = grouped && g !== lastGroup ? g : null;
    lastGroup = g;
    return { b, heading };
  });

  return (
    <>
      {/* Wider screens: a sortable table. */}
      <div className="card-soft hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              {selecting ? <th className="w-10 px-3" /> : null}
              {COLUMNS.map(header)}
            </tr>
          </thead>
          <tbody>
            {sections.map(({ b, heading }) => (
              <BookingRowGroup key={b.id} heading={heading} span={COLUMNS.length + (selecting ? 1 : 0)}>
                <tr
                  className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-muted", picked.has(b.id) && "bg-primary/5")}
                  onClick={() => (selecting ? onToggle(b.id) : onOpen(b.id))}
                >
                  {selecting ? (
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={picked.has(b.id)} onCheckedChange={() => onToggle(b.id)} aria-label={name(b)} />
                    </td>
                  ) : null}
                  <td className="px-3 py-3 font-medium">{name(b)}</td>
                  <td className="px-3 py-3">{roomName(b.room_id)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatUkDate(b.check_in_date)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatUkDate(b.check_out_date)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{nights(b)}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      <ChannelIcon channel={b.channel} iconUrl={site(b)?.iconUrl ?? null} label={site(b)?.label ?? b.channel} size="1.25rem" />
                      {site(b)?.label ?? b.channel}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge state={stayState(b, today)} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {b.stay_amount_pence != null ? formatMoney(b.stay_amount_pence, currency) : "—"}
                  </td>
                </tr>
              </BookingRowGroup>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: the same stays as cards. */}
      <ul className="space-y-2 md:hidden">
        {sections.map(({ b, heading }) => (
          <li key={b.id}>
            {heading ? <p className="mb-1 mt-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.groups[heading]}</p> : null}
            <button
              type="button"
              onClick={() => (selecting ? onToggle(b.id) : onOpen(b.id))}
              className={cn("card-soft flex w-full items-center gap-3 p-4 text-left", picked.has(b.id) && "ring-2 ring-primary")}
            >
              {selecting ? <Checkbox checked={picked.has(b.id)} tabIndex={-1} aria-hidden /> : null}
              <ChannelIcon channel={b.channel} iconUrl={site(b)?.iconUrl ?? null} label={site(b)?.label ?? b.channel} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{name(b)}</span>
                <span className="block text-sm text-muted-foreground">
                  {roomName(b.room_id)} · {formatUkDate(b.check_in_date)} → {formatUkDate(b.check_out_date)} · {nights(b)}{" "}
                  {nights(b) === 1 ? bookingCopy.night : bookingCopy.nights}
                </span>
              </span>
              <StatusBadge state={stayState(b, today)} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** A group heading row (in the default order) before the stay's own row. */
function BookingRowGroup({ heading, span, children }: { heading: StayGroup | null; span: number; children: React.ReactNode }) {
  return (
    <>
      {heading ? (
        <tr className="bg-muted/50">
          <td colSpan={span} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.groups[heading]}
          </td>
        </tr>
      ) : null}
      {children}
    </>
  );
}
