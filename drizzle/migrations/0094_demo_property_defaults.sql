-- What a Latchkey admin changes on the shared demo properties stays: each property is rebuilt daily,
-- so every setting they change is kept here, by the property's link name, and applied on the rebuild.
-- Only what they changed is kept, so anything else still follows the demo's standard set-up.
-- Written only by the trigger below; read and cleared by the server. Rules in src/lib/demo-defaults.ts.
create table if not exists public.demo_property_defaults (
  short_code text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.demo_property_defaults enable row level security;
revoke all on public.demo_property_defaults from anon, authenticated;
grant all on public.demo_property_defaults to service_role;

create or replace function public.keep_demo_property_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed jsonb;
begin
  -- Only a Latchkey admin's own change, and only on the shared demo business (the one with the tour).
  if auth.uid() is null or not public.is_super_admin() then
    return new;
  end if;
  if not exists (
    select 1 from public.properties t
     where t.host_id = new.host_id and t.short_code = 'tour' and t.is_demo
  ) then
    return new;
  end if;
  select jsonb_object_agg(n.key, n.value) into changed
    from jsonb_each(to_jsonb(new)) n
   where n.key not in (
           'id', 'host_id', 'short_code', 'is_demo', 'created_at', 'check_in_pin',
           'kiosk_cards_at', 'trades_ai_at'
         )
     and n.value is distinct from (to_jsonb(old) -> n.key);
  if changed is null then
    return new;
  end if;
  insert into public.demo_property_defaults (short_code, settings, updated_at, updated_by)
  values (new.short_code, changed, now(), auth.uid())
  on conflict (short_code) do update
    set settings = public.demo_property_defaults.settings || excluded.settings,
        updated_at = now(),
        updated_by = auth.uid();
  return new;
end $$;

drop trigger if exists keep_demo_property_change on public.properties;
create trigger keep_demo_property_change after update on public.properties
  for each row when (new.is_demo) execute function public.keep_demo_property_change();
