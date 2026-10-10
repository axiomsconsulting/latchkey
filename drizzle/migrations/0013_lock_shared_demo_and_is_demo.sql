-- Shared public demo: many anonymous visitors sign in as one demo host, so
-- anything they change is seen by everyone else. Day-to-day work (bookings,
-- requests, jobs, alerts, messages) stays open; account settings, property
-- set-up, guides, prices, contacts and connections are read-only for them.

create or replace function public.is_shared_demo_user()
returns boolean language sql stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'demo@latchkey.omsestates.uk'
$$;

create or replace function public.block_shared_demo_writes()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_shared_demo_user() then
    raise exception 'Settings are locked in the shared demo. Start a free trial to change them.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'hosts', 'host_members', 'properties', 'rooms', 'unavailability_windows',
    'channel_connections', 'room_listings', 'guides', 'guide_steps',
    'extras_catalogue', 'trades'
  ] loop
    execute format('drop trigger if exists shared_demo_read_only on public.%I', t);
    execute format(
      'create trigger shared_demo_read_only before insert or update or delete on public.%I
         for each row execute function public.block_shared_demo_writes()', t);
  end loop;
end $$;

-- is_demo switches off lockouts and turns on demo shortcuts, so only Latchkey's
-- own server code (service role) may set it. Signed-in hosts cannot.
create or replace function public.guard_is_demo()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' and (
       (tg_op = 'INSERT' and new.is_demo)
       or (tg_op = 'UPDATE' and new.is_demo is distinct from old.is_demo)
     ) then
    raise exception 'Sample data can only be created from Settings.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists guard_is_demo on public.properties;
create trigger guard_is_demo before insert or update on public.properties
  for each row execute function public.guard_is_demo();
