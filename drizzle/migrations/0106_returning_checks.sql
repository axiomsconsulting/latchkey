-- Returning guests: whether they show their ID again on a new stay (src/lib/returning-checks.ts).
-- lenient = never again (the start), overseas = guests who aren't British do, always = everyone does.
alter table public.properties
  add column if not exists returning_checks text not null default 'lenient';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'properties_returning_checks_check'
  ) then
    alter table public.properties
      add constraint properties_returning_checks_check
      check (returning_checks in ('lenient', 'overseas', 'always'));
  end if;
end $$;

-- A guest staying on in the same room on a new booking: the stay it carries on from
-- (src/lib/stay-on.server.ts). A plain column, no foreign key, like test_room_id.
alter table public.bookings add column if not exists continues_from uuid;
