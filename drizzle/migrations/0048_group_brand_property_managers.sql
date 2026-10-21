-- Groups of properties (src/lib/group-brand.ts): the business's own logo and
-- where it shows. Each property keeps its own logo in its theme.
alter table public.hosts add column if not exists group_brand jsonb not null default '{}'::jsonb;

-- Properties for each team member: null = every property of the business
-- (owners always); a list = only those (a property's own manager, cleaner
-- or viewer). Invites carry the same list.
alter table public.host_members add column if not exists property_ids uuid[];
alter table public.host_invitations add column if not exists property_ids uuid[];

-- Owners always see the whole business.
create or replace function public.owners_see_everything()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.role = 'owner' then
    new.property_ids := null;
  elsif new.property_ids is not null and cardinality(new.property_ids) = 0 then
    new.property_ids := null;
  end if;
  return new;
end $$;
drop trigger if exists owners_see_everything on public.host_members;
create trigger owners_see_everything before insert or update on public.host_members for each row execute function public.owners_see_everything();

/*
 * Can the signed-in person see this property's rows? Yes unless they're on the
 * business's team with a list of properties that leaves this one out. Latchkey's
 * server (no signed-in person) and super admins always can; rows that belong
 * to no property (null) are the business's and stay with its other rules.
 */
create or replace function public.property_visible(_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _property_id is null
      or auth.uid() is null
      or public.is_super_admin()
      or not exists (
        select 1
        from public.properties p
        join public.host_members m on m.host_id = p.host_id and m.user_id = auth.uid()
        where p.id = _property_id
          and m.property_ids is not null
          and not (_property_id = any (m.property_ids))
      )
$$;
grant execute on function public.property_visible(uuid) to authenticated;

-- Restrictive rules: added on top of every table's existing rules, so a
-- property's own team only ever sees (and changes) that property's rows.
do $$
declare
  t text;
  by_property text[] := array[
    'rooms', 'bookings', 'guides', 'extras_catalogue', 'channel_connections', 'unavailability_windows',
    'service_jobs', 'invoices', 'guest_register', 'guest_ids', 'room_readiness', 'direct_enquiries',
    'guide_attachments', 'kiosk_messages', 'room_listings', 'check_in_attempts', 'trades', 'guest_contacts', 'host_alerts'
  ];
  by_booking text[] := array['requests', 'messages', 'payments'];
begin
  -- The properties themselves.
  execute 'drop policy if exists properties_property_scope on public.properties';
  execute 'create policy properties_property_scope on public.properties as restrictive for all to authenticated using (public.property_visible(id)) with check (public.property_visible(id))';

  foreach t in array by_property loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'property_id') then
      execute format('drop policy if exists %I on public.%I', t || '_property_scope', t);
      execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.property_visible(property_id)) with check (public.property_visible(property_id))', t || '_property_scope', t);
    end if;
  end loop;

  foreach t in array by_booking loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'booking_id') then
      execute format('drop policy if exists %I on public.%I', t || '_property_scope', t);
      execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.property_visible((select b.property_id from public.bookings b where b.id = booking_id))) with check (public.property_visible((select b.property_id from public.bookings b where b.id = booking_id)))', t || '_property_scope', t);
    end if;
  end loop;

  -- Guide steps belong to a guide.
  execute 'drop policy if exists guide_steps_property_scope on public.guide_steps';
  execute 'create policy guide_steps_property_scope on public.guide_steps as restrictive for all to authenticated using (public.property_visible((select g.property_id from public.guides g where g.id = guide_id))) with check (public.property_visible((select g.property_id from public.guides g where g.id = guide_id)))';
end $$;

-- Accepting an invite brings its properties along.
create or replace function public.accept_host_invitation(_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  _confirmed timestamptz;
  inv public.host_invitations%rowtype;
begin
  if _uid is null then
    raise exception 'Please sign in first.' using errcode = 'P0001';
  end if;
  if public.is_shared_demo_user() then
    raise exception 'The shared demo can''t join a team. Create your own account first.' using errcode = 'P0001';
  end if;
  select * into inv from public.host_invitations where token_hash = public.invitation_hash(_token) for update;
  if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at < now() then
    raise exception 'This invite is no longer valid. Ask the owner to send a new one.' using errcode = 'P0001';
  end if;
  if inv.email <> _email then
    raise exception 'This invite was sent to a different email address.' using errcode = 'P0001';
  end if;
  select email_confirmed_at into _confirmed from auth.users where id = _uid;
  if _confirmed is null then
    raise exception 'Please confirm your email address first.' using errcode = 'P0001';
  end if;

  insert into public.host_members (host_id, user_id, role, invited_by, property_ids)
    values (inv.host_id, _uid, inv.role, inv.invited_by, inv.property_ids)
    on conflict (host_id, user_id) do update set role = excluded.role, invited_by = excluded.invited_by, property_ids = excluded.property_ids;
  update public.host_invitations set accepted_at = now(), accepted_by = _uid where id = inv.id;
  return inv.host_id;
end $$;
revoke all on function public.accept_host_invitation(text) from public, anon;
grant execute on function public.accept_host_invitation(text) to authenticated;
