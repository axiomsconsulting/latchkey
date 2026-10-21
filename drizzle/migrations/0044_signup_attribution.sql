-- Where a business's first visit came from (utm_*, ref; src/lib/attribution.ts),
-- saved once when the trial is set up. Never overwritten afterwards.
alter table public.hosts add column if not exists signup_utm jsonb;
