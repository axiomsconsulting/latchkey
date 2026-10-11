-- Read-only members (viewer, cleaner) used to get silent no-ops: RLS hid the
-- rows from their updates and deletes, so screens said "Saved" when nothing
-- was. Members can now reach those rows, and a BEFORE trigger refuses the
-- write with a clear message. Outsiders still see nothing. Inserts are
-- refused by the same trigger before RLS checks the new row.

/** The host a row belongs to, for the business tables below. */
create or replace function public.row_host_id(_table text, r jsonb)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare h uuid;
begin
  if r ? 'host_id' then
    return (r ->> 'host_id')::uuid;
  elsif r ? 'property_id' then
    return public.property_host_id((r ->> 'property_id')::uuid);
  elsif _table = 'room_listings' then
    select p.host_id into h from public.rooms x join public.properties p on p.id = x.property_id
      where x.id = (r ->> 'room_id')::uuid;
  elsif _table = 'guide_steps' then
    select p.host_id into h from public.guides g join public.properties p on p.id = g.property_id
      where g.id = (r ->> 'guide_id')::uuid;
  elsif r ? 'booking_id' then
    select p.host_id into h from public.bookings b join public.properties p on p.id = b.property_id
      where b.id = (r ->> 'booking_id')::uuid;
  end if;
  return h;
end $$;

create or replace function public.require_host_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  h uuid;
begin
  -- Latchkey's server (service role) has no user and is never limited here.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  h := public.row_host_id(tg_table_name, r);
  if h is not null and public.is_host_member(h) and not public.can_write_host(h) then
    raise exception 'You have read-only access to this host.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare
  spec text[];
  specs text[][] := array[
    array['properties', 'host_id'],
    array['rooms', 'public.property_host_id(property_id)'],
    array['unavailability_windows', 'public.property_host_id(property_id)'],
    array['channel_connections', 'public.property_host_id(property_id)'],
    array['room_listings', 'public.property_host_id((select r.property_id from public.rooms r where r.id = room_id))'],
    array['bookings', 'public.property_host_id(property_id)'],
    array['guides', 'public.property_host_id(property_id)'],
    array['guide_steps', 'public.property_host_id((select g.property_id from public.guides g where g.id = guide_id))'],
    array['extras_catalogue', 'public.property_host_id(property_id)'],
    array['requests', 'public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))'],
    array['messages', 'public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))'],
    array['host_alerts', 'host_id'],
    array['service_jobs', 'host_id'],
    array['trades', 'host_id']
  ];
begin
  foreach spec slice 1 in array specs loop
    -- The trigger first, so these policies never let a read-only member write.
    execute format('drop trigger if exists require_host_write on public.%I', spec[1]);
    execute format('create trigger require_host_write before insert or update or delete on public.%I
      for each row execute function public.require_host_write()', spec[1]);
    -- Update keeps a staff-only WITH CHECK as a second guard.
    execute format('drop policy if exists %I on public.%I', spec[1] || '_member_update', spec[1]);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_host_member(%s)) with check (public.is_host_staff(%s))',
      spec[1] || '_member_update', spec[1], spec[2], spec[2]);
    -- Delete only where staff could already delete: properties stay
    -- owner-only and host alerts are never deleted from the app.
    if spec[1] not in ('properties', 'host_alerts') then
      execute format('drop policy if exists %I on public.%I', spec[1] || '_member_delete', spec[1]);
      execute format('create policy %I on public.%I for delete to authenticated using (public.is_host_member(%s))',
        spec[1] || '_member_delete', spec[1], spec[2]);
    end if;
  end loop;
end $$;
