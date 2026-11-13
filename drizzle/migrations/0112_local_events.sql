-- Around here (src/lib/local-guide.ts): events are read on their own schedule, only while guests
-- are staying or arriving within a week (eventWindow), up to their last check-out, and kept only
-- that long (keepEvents, daily sweep). events_at says when they were last read. Additive.
alter table public.local_places add column if not exists events_at timestamptz;
