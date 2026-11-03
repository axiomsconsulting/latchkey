-- Door codes for two doors: bookings.door_code is the front door's, door_code_room the
-- room door's, each with the host's ticks that it's on or off the lock. door_code_hidden:
-- the host isn't giving this guest a code, so none is made or shown. door_code_shown_at:
-- when the guest first saw one; a code nobody saw doesn't count as used. Additive.

alter table public.bookings add column if not exists door_code_room text check (door_code_room is null or char_length(door_code_room) <= 24);
alter table public.bookings add column if not exists door_code_room_set_at timestamptz;
alter table public.bookings add column if not exists door_code_room_removed_at timestamptz;
alter table public.bookings add column if not exists door_code_hidden boolean not null default false;
alter table public.bookings add column if not exists door_code_shown_at timestamptz;
create index if not exists bookings_door_code_room_idx on public.bookings(property_id, door_code_room) where door_code_room is not null;

-- As assign_door_code(uuid, text), for either door, refusing a code that another stay
-- still holds on either door.
create or replace function public.assign_door_code(_booking uuid, _code text, _door text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  if _door not in ('front', 'room') then return false; end if;
  select * into b from public.bookings where id = _booking;
  if b.id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('door_code:' || b.property_id::text));
  if exists (
    select 1 from public.bookings o
    where o.property_id = b.property_id
      and o.id <> b.id
      and (o.door_code = _code or o.door_code_room = _code)
      and o.status <> 'cancelled'
      and o.check_out_date >= current_date - 1
  ) then
    return false;
  end if;
  if _door = 'front' then
    update public.bookings
      set door_code = _code, door_code_set_at = null, door_code_removed_at = null
      where id = _booking;
  else
    update public.bookings
      set door_code_room = _code, door_code_room_set_at = null, door_code_room_removed_at = null
      where id = _booking;
  end if;
  return true;
end;
$$;

revoke all on function public.assign_door_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.assign_door_code(uuid, text, text) to service_role;
