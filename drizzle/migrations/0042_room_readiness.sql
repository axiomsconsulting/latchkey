-- Housekeeping and readiness board (src/lib/housekeeping.ts): where each
-- room's cleaning has got to on a day, who is on it, when it must be ready
-- and who last changed it. One row per room and day; no row = what the
-- bookings suggest. Owners, managers and cleaners can update it.
create table if not exists public.room_readiness (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  day date not null,
  status text not null check (status in ('to_clean','cleaning','clean','ready','out_of_service')),
  assignee text check (assignee is null or char_length(assignee) <= 80),
  due_time time,
  note text check (note is null or char_length(note) <= 500),
  updated_by uuid,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  unique (room_id, day)
);
create index if not exists room_readiness_property_day_idx on public.room_readiness(property_id, day);
alter table public.room_readiness enable row level security;
grant all on public.room_readiness to service_role;
grant select, insert, update, delete on public.room_readiness to authenticated;

drop policy if exists room_readiness_read on public.room_readiness;
create policy room_readiness_read on public.room_readiness for select to authenticated
  using (exists (select 1 from public.properties p where p.id = property_id and public.is_host_member(p.host_id)));

-- Cleaners update the board too (they can't change anything else).
drop policy if exists room_readiness_write on public.room_readiness;
create policy room_readiness_write on public.room_readiness for all to authenticated
  using (exists (select 1 from public.properties p where p.id = property_id
    and (public.can_write_host(p.host_id) or (public.has_host_role(p.host_id, 'cleaner') and public.host_has_access(p.host_id)))))
  with check (exists (select 1 from public.properties p join public.rooms r on r.property_id = p.id
    where p.id = property_id and r.id = room_id
    and (public.can_write_host(p.host_id) or (public.has_host_role(p.host_id, 'cleaner') and public.host_has_access(p.host_id)))));
