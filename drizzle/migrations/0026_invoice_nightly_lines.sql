-- Invoices can list each night on its own line with its share of the price.
-- Site-wide, set by the super admin; on by default.
alter table public.site_settings add column if not exists invoice_nightly_lines boolean not null default true;

-- The lines as they were issued: [{ date, description, amount_pence }].
alter table public.invoices add column if not exists lines jsonb check (lines is null or jsonb_typeof(lines) = 'array');

-- Super admins manage the list of super admins in the app. Who added whom,
-- and when, so the list explains itself. The last one can't be removed.
alter table public.super_admins
  add column if not exists added_by text,
  add column if not exists added_at timestamptz not null default now();

create or replace function public.prevent_last_super_admin()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.super_admins) <= 1 then
    raise exception 'Latchkey needs at least one super admin.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists prevent_last_super_admin on public.super_admins;
create trigger prevent_last_super_admin before delete on public.super_admins
  for each row execute function public.prevent_last_super_admin();
