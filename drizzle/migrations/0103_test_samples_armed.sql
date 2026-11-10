-- The host's sample photos can be armed for the next check-in on any of the property's door
-- tablets (TestStayCard), for 10 minutes and one check-in only: the first kiosk to pick them up
-- clears it. Additive.
alter table public.test_check_in_samples add column if not exists armed_until timestamptz;
