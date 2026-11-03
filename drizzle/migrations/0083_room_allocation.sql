-- ID and selfie first, room second. bookings.room_check says Latchkey isn't sure
-- of this stay's guest: { reason, held, idName, at }. held = nobody could be
-- placed yet: the row only holds the guest's check-in (no room, hidden from every
-- list) until the host places them. name_from_id: the name came from the guest's
-- ID, not from the booking. Additive.

alter table public.bookings add column if not exists room_check jsonb;
alter table public.bookings add column if not exists name_from_id boolean not null default false;
create index if not exists bookings_room_check_idx on public.bookings(property_id) where room_check is not null;

-- Swaps two stays' check-ins, whichever side has one: everyone's ID and register
-- records, guide links, messages and requests move, and each stay's check-in state
-- follows. A stay left with nobody goes back to waiting. A name that came from an ID
-- goes with that guest; a name from the booking stays on the booking.
create or replace function public.exchange_check_ins(_a uuid, _b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ra public.bookings;
  rb public.bookings;
  lead_a text;
  lead_b text;
  t text;
begin
  if _a = _b then return; end if;
  select * into ra from public.bookings where id = _a for update;
  select * into rb from public.bookings where id = _b for update;
  if ra.id is null or rb.id is null or ra.property_id <> rb.property_id then
    raise exception 'Those stays can''t be swapped.';
  end if;

  select full_name into lead_a from public.guest_ids where booking_id = _a and position = 0;
  select full_name into lead_b from public.guest_ids where booking_id = _b and position = 0;

  -- One per (stay, position), so the rows step aside rather than swap in place.
  create temporary table exchange_people on commit drop as
    select * from public.guest_ids where booking_id = _a;
  delete from public.guest_ids where booking_id = _a;
  update public.guest_ids set booking_id = _a where booking_id = _b;
  update exchange_people set booking_id = _b;
  insert into public.guest_ids select * from exchange_people;
  drop table exchange_people;

  foreach t in array array[
    'guest_register', 'checkin_sessions', 'stay_tokens', 'stay_short_links',
    'verification_results', 'presence_log', 'messages', 'requests', 'payments', 'feedback'
  ] loop
    execute format(
      'update public.%I set booking_id = case when booking_id = $1 then $2 else $1 end where booking_id in ($1, $2)',
      t
    ) using _a, _b;
  end loop;
  update public.service_jobs
    set booking_id = case when booking_id = _a then _b else _a end
    where booking_id in (_a, _b) and source = 'guest';

  -- Each stay takes the other's check-in state, or goes back to waiting.
  update public.bookings b set
    status = case
      when o.status in ('checked_in', 'checked_out') then o.status
      when b.status in ('checked_in', 'checked_out') then
        case when coalesce(nullif(btrim(n.name), ''), null) is null then 'needs_details' else 'upcoming' end::public.booking_status
      else b.status end,
    checked_in_at = o.checked_in_at,
    checked_out_at = o.checked_out_at,
    id_check_status = o.id_check_status,
    guest_full_name = n.name,
    name_from_id = n.from_id
  from (
    select _a as id, rb.status as status, rb.checked_in_at as checked_in_at,
           rb.checked_out_at as checked_out_at, rb.id_check_status as id_check_status
    union all
    select _b, ra.status, ra.checked_in_at, ra.checked_out_at, ra.id_check_status
  ) o
  join (
    select _a as id,
      case when ra.name_from_id or coalesce(btrim(ra.guest_full_name), '') = '' then lead_b else ra.guest_full_name end as name,
      case when ra.name_from_id or coalesce(btrim(ra.guest_full_name), '') = '' then lead_b is not null else false end as from_id
    union all
    select _b,
      case when rb.name_from_id or coalesce(btrim(rb.guest_full_name), '') = '' then lead_a else rb.guest_full_name end,
      case when rb.name_from_id or coalesce(btrim(rb.guest_full_name), '') = '' then lead_a is not null else false end
  ) n on n.id = o.id
  where b.id = o.id;

  -- The register names the room each guest is really in.
  update public.guest_register g
    set room_name = (select r.display_name from public.rooms r join public.bookings b on b.room_id = r.id where b.id = g.booking_id)
    where g.booking_id in (_a, _b);
end;
$$;

revoke all on function public.exchange_check_ins(uuid, uuid) from public, anon, authenticated;
grant execute on function public.exchange_check_ins(uuid, uuid) to service_role;
