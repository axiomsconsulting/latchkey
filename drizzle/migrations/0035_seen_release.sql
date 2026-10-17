-- The newest Latchkey release each person has seen, so "What's new" shows once per update.
alter table public.user_prefs add column if not exists seen_release text check (seen_release is null or seen_release ~ '^\d+\.\d+\.\d+$');
