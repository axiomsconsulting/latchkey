-- One check-in moving between the door tablet and a guest's phone, and back: which device is in
-- control and the screens still to come (src/lib/checkin-handoff.ts). Server only (RLS on, no
-- policies): it can hold the register details read from an ID. Deleted when the check-in
-- completes, with its session, or a day after its last change (retention sweep). Additive.
create table if not exists public.checkin_handoffs (
  session_id uuid primary key references public.checkin_sessions(id) on delete cascade,
  at text check (at in ('kiosk', 'phone')),
  rev integer not null default 0,
  state jsonb,
  updated_at timestamptz not null default now()
);
alter table public.checkin_handoffs enable row level security;
grant all on public.checkin_handoffs to service_role;
