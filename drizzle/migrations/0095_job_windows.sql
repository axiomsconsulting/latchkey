-- Maintenance and other jobs on the housekeeping timeline: a job can cover more than one room
-- (room_ids; room_id stays the first one so older code keeps working), and tradespeople give a
-- window rather than a time (window_end), or a whole day (all_day). Additive.

alter table public.service_jobs add column if not exists room_ids uuid[];
alter table public.service_jobs add column if not exists window_end timestamptz;
alter table public.service_jobs add column if not exists all_day boolean not null default false;
