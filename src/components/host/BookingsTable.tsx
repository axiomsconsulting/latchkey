import { ArrowDown, ArrowUp, ChevronDown, Search } from "lucide-react";

import { ChannelIcon } from "@/components/ChannelIcon";
import { StatusIcon } from "@/components/host/StatusBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  GROUP_ORDER,
  closedNote,
  closedReason,
  nights,
  stayDates,
  stayGroup,
  type ListBooking,
  type ListFilters,
  type SortKey,
  type StayGroup,
} from "@/lib/booking-list";
import { platformKey, type Site } from "@/lib/booking-sites";
import { formatUkDate, stayState } from "@/lib/dates";
import { formatMoney } from "@/lib/invoice";
import { cn } from "@/lib/utils";

type Option = { key: string; label: string };

/** A short label on hover, long-press or keyboard focus. */
export function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A dropdown of tickboxes: ticked means shown. */
function ShowHide({
  label,
  options,
  hidden,
  onChange,
  className,
}: {
  label: string;
  options: Option[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
  className?: string;
}) {
  const shown = options.length - options.filter((o) => hidden.includes(o.key)).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-11 min-w-0 gap-1.5 px-3", hidden.length && "border-primary", className)}
        >
          <span className="truncate">{label}</span>
          <span className="shrink-0 rounded-full bg-secondary px-1.5 text-xs">
            {shown}/{options.length}
          </span>
          <ChevronDown className="size-4 shrink-0 max-[380px]:hidden" />
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
            onCheckedChange={(on) =>
              onChange(on ? hidden.filter((h) => h !== o.key) : [...hidden, o.key])
            }
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
  const roomOptions = [
    ...rooms.map((r) => ({ key: r.id, label: r.display_name })),
    { key: "none", label: copy.noRoom },
  ];
  const platformOptions = sites.map((s) => ({ key: s.key, label: s.label }));
  const pastShown = !filters.hideGroups.includes("past");
  const anyHidden =
    filters.hideGroups.length + filters.hideRooms.length + filters.hidePlatforms.length > 0 ||
    filters.search;

  // A phone: search on its own row, the three filters sharing the next evenly, then past stays and the count.
  // Wider: all in one row.
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="relative lg:min-w-56 lg:flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          type="search"
          placeholder={copy.search}
          aria-label={copy.search}
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 lg:flex">
        <ShowHide
          label={copy.status}
          options={groupOptions}
          hidden={filters.hideGroups}
          onChange={(h) => onChange({ ...filters, hideGroups: h as StayGroup[] })}
        />
        <ShowHide
          label={copy.rooms}
          options={roomOptions}
          hidden={filters.hideRooms}
          onChange={(h) => onChange({ ...filters, hideRooms: h })}
        />
        <ShowHide
          label={copy.platforms}
          options={platformOptions}
          hidden={filters.hidePlatforms}
          onChange={(h) => onChange({ ...filters, hidePlatforms: h })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm">
          <Switch
            checked={pastShown}
            onCheckedChange={(on) =>
              onChange({
                ...filters,
                hideGroups: on
                  ? filters.hideGroups.filter((g) => g !== "past")
                  : [...filters.hideGroups, "past"],
              })
            }
          />
          {copy.showPast}
        </label>
        <span className="text-sm text-muted-foreground">{copy.shown(shown, total)}</span>
        {anyHidden ? (
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() =>
              onChange({ search: "", hideGroups: [], hideRooms: [], hidePlatforms: [] })
            }
          >
            {copy.clear}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// Arrival, departure and nights share one column; the site and status are icons.
const COLUMNS: SortKey[] = ["guest", "room", "checkIn", "platform", "status", "amount"];

/**
 * Stays as a table on wider screens and as cards on phones, in the order
 * chosen. Group headings appear in the default order.
 */
export function BookingsTable({
  rows,
  allRows,
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
  rowActions,
}: {
  /** Quick icons at the end of a row (e.g. add name, not a booking, hide). */
  rowActions?: (b: ListBooking) => React.ReactNode;
  rows: ListBooking[];
  /** Every stay, so a closed night can name the booking it mirrors. */
  allRows?: ListBooking[];
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
  if (rows.length === 0)
    return <div className="card-soft p-8 text-center text-muted-foreground">{copy.nothing}</div>;
  const roomName = (id: string | null) =>
    rooms.find((r) => r.id === id)?.display_name ?? copy.noRoom;
  const site = (b: ListBooking) => sites.find((s) => s.key === platformKey(b));
  const platformLabel = (b: ListBooking) => site(b)?.label ?? b.channel;
  // Closed nights say why they're closed instead of asking for a guest name.
  // Closed nights and stays without a name get their icons here instead of a
  // label: the status icon and the group heading already say what they are.
  const closed = (b: ListBooking) => stayGroup(b, today) === "closed";
  const name = (b: ListBooking) =>
    closed(b)
      ? closedReason(b, allRows ?? rows, platformLabel)
      : b.guest_full_name?.trim() || bookingCopy.guestUnknown;
  const shownText = (b: ListBooking) =>
    closed(b)
      ? closedNote(b, allRows ?? rows, platformLabel)
      : b.guest_full_name?.trim() || b.reservation_code || "";
  const unnamed = (b: ListBooking) => !closed(b) && !b.guest_full_name?.trim();
  const statusOf = (b: ListBooking) => (b.mirror_of ? "mirror" : stayState(b, today));
  // Mirrors say whose booking they follow; blocks show the host's note, if any.
  const statusDetail = (b: ListBooking) =>
    b.mirror_of
      ? closedReason(b, allRows ?? rows, platformLabel)
      : closed(b)
        ? closedNote(b, allRows ?? rows, platformLabel) || null
        : null;
  const nightsText = (b: ListBooking) =>
    `${nights(b)} ${nights(b) === 1 ? bookingCopy.night : bookingCopy.nights}`;
  const guestCell = (b: ListBooking) => (
    <span className="flex min-w-0 items-center gap-1">
      {rowActions && !selecting ? (
        <span className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          {rowActions(b)}
        </span>
      ) : null}
      <span
        className={cn(
          "min-w-0 truncate",
          closed(b) || unnamed(b) ? "text-sm text-muted-foreground" : "font-medium",
        )}
        title={name(b)}
      >
        {shownText(b)}
      </span>
    </span>
  );
  const grouped = sort.key === "smart";

  function header(key: SortKey) {
    const active = sort.key === key;
    const next = active && sort.dir === "asc" ? "desc" : "asc";
    return (
      <th
        key={key}
        className={cn(
          "px-3 py-2 font-medium",
          (key === "nights" || key === "amount") && "text-right",
        )}
      >
        <button
          type="button"
          onClick={() =>
            onSort(
              active && sort.dir === "desc" ? { key: "smart", dir: "asc" } : { key, dir: next },
            )
          }
          className="inline-flex items-center gap-1 hover:text-foreground"
          aria-label={copy.sortBy(copy.cols[key]!)}
          aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        >
          {copy.cols[key]}
          {active ? (
            sort.dir === "asc" ? (
              <ArrowUp className="size-3.5" />
            ) : (
              <ArrowDown className="size-3.5" />
            )
          ) : null}
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
    <TooltipProvider delayDuration={250}>
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
              <BookingRowGroup
                key={b.id}
                heading={heading}
                span={COLUMNS.length + (selecting ? 1 : 0)}
              >
                <tr
                  id={`stay-${b.id}`}
                  data-tour="booking-row"
                  className={cn(
                    "cursor-pointer border-b border-border last:border-0 hover:bg-muted",
                    picked.has(b.id) && "bg-primary/5",
                  )}
                  onClick={() => (selecting ? onToggle(b.id) : onOpen(b.id))}
                >
                  {selecting ? (
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={picked.has(b.id)}
                        onCheckedChange={() => onToggle(b.id)}
                        aria-label={name(b)}
                      />
                    </td>
                  ) : null}
                  <td className="w-[34%] min-w-[13rem] max-w-0 px-2 py-2">{guestCell(b)}</td>
                  <td className="px-3 py-2">{roomName(b.room_id)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {stayDates(b.check_in_date, b.check_out_date, today)}
                    <span className="ml-1.5 text-xs text-muted-foreground">· {nightsText(b)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Tip label={site(b)?.label ?? b.channel}>
                      <span
                        tabIndex={0}
                        className="inline-flex"
                        aria-label={site(b)?.label ?? b.channel}
                      >
                        <ChannelIcon
                          channel={b.channel}
                          iconUrl={site(b)?.iconUrl ?? null}
                          label={site(b)?.label ?? b.channel}
                          size="1.25rem"
                        />
                      </span>
                    </Tip>
                  </td>
                  <td className="px-3 py-2">
                    <StatusIcon state={statusOf(b)} detail={statusDetail(b)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
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
            {heading ? (
              <p className="mb-1 mt-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {copy.groups[heading]}
              </p>
            ) : null}
            <div
              className={cn(
                "card-soft flex items-center gap-3 p-3",
                picked.has(b.id) && "ring-2 ring-primary",
              )}
            >
              {selecting ? (
                <Checkbox
                  checked={picked.has(b.id)}
                  onCheckedChange={() => onToggle(b.id)}
                  aria-label={name(b)}
                />
              ) : null}
              <ChannelIcon
                channel={b.channel}
                iconUrl={site(b)?.iconUrl ?? null}
                label={site(b)?.label ?? b.channel}
                size={28}
              />
              <div className="min-w-0 flex-1">
                {guestCell(b)}
                <button
                  type="button"
                  data-tour="booking-row"
                  onClick={() => (selecting ? onToggle(b.id) : onOpen(b.id))}
                  className="block w-full truncate text-left text-sm text-muted-foreground"
                  aria-label={`${name(b)}: ${stayDates(b.check_in_date, b.check_out_date, today)}`}
                >
                  {roomName(b.room_id)} · {stayDates(b.check_in_date, b.check_out_date, today)} ·{" "}
                  {nightsText(b)}
                </button>
              </div>
              <button
                type="button"
                onClick={() => (selecting ? onToggle(b.id) : onOpen(b.id))}
                className="shrink-0"
                aria-label={name(b)}
              >
                <StatusIcon state={statusOf(b)} detail={statusDetail(b)} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </TooltipProvider>
  );
}

/** A group heading row (in the default order) before the stay's own row. */
function BookingRowGroup({
  heading,
  span,
  children,
}: {
  heading: StayGroup | null;
  span: number;
  children: React.ReactNode;
}) {
  return (
    <>
      {heading ? (
        <tr className="bg-muted/50">
          <td
            colSpan={span}
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {copy.groups[heading]}
          </td>
        </tr>
      ) : null}
      {children}
    </>
  );
}
