-- Each business's privacy and retention choices (src/lib/privacy.ts):
-- {"guestDetailsDays": 30|90|180|365, "messagesDays": 90|180|365|0}.
-- Empty = today's behaviour (details cleared after 90 days, messages kept).
alter table public.hosts add column if not exists privacy jsonb not null default '{}'::jsonb;

-- The guest guide's quick tiles, chosen by the host (src/lib/guide-tiles.ts).
-- null = the automatic set.
alter table public.properties add column if not exists guide_tiles jsonb;

-- A photo for each room's guide cover; null uses the property's cover.
alter table public.rooms add column if not exists cover_image_url text;

-- Demo/live switches are Latchkey admins' to change (they spend money and
-- contact real people). Owners keep reading them; only super admins and the
-- server may write them.
create or replace function public.protect_admin_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;
  new.integration_modes := old.integration_modes;
  return new;
end $$;
drop trigger if exists protect_admin_fields on public.hosts;
create trigger protect_admin_fields before update on public.hosts for each row execute function public.protect_admin_fields();
