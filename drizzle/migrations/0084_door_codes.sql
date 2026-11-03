-- Door codes: properties.door_codes is the host's set-up (src/lib/door-codes.ts);
-- a stay's own code lives on bookings.door_code. door_code_set_at / door_code_removed_at
-- are the host's ticks that it's on, or off, the lock. Additive.

alter table public.properties add column if not exists door_codes jsonb;
alter table public.bookings add column if not exists door_code text check (door_code is null or char_length(door_code) <= 24);
alter table public.bookings add column if not exists door_code_set_at timestamptz;
alter table public.bookings add column if not exists door_code_removed_at timestamptz;
create index if not exists bookings_door_code_idx on public.bookings(property_id, door_code) where door_code is not null;

-- Gives a stay a code, one at a time per property, and refuses a code that another
-- stay still holds (here now or still to come): two guests must never share one.
create or replace function public.assign_door_code(_booking uuid, _code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = _booking;
  if b.id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('door_code:' || b.property_id::text));
  if exists (
    select 1 from public.bookings o
    where o.property_id = b.property_id
      and o.id <> b.id
      and o.door_code = _code
      and o.status <> 'cancelled'
      and o.check_out_date >= current_date - 1
  ) then
    return false;
  end if;
  update public.bookings
    set door_code = _code, door_code_set_at = null, door_code_removed_at = null
    where id = _booking;
  return true;
end;
$$;

revoke all on function public.assign_door_code(uuid, text) from public, anon, authenticated;
grant execute on function public.assign_door_code(uuid, text) to service_role;
