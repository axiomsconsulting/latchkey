-- The home page's pictures, chosen by the super admin (src/lib/home-art.ts);
-- null = Latchkey's defaults, an empty list = none.
alter table public.site_settings add column if not exists home_art jsonb;

-- Guest reviews from direct stays: a score out of 10 (the 1-5 rating stays
-- filled in for the host's list), whether the guest agreed to it being
-- shown on the property's booking page, the name shown with it (their
-- first name), and the host's own "don't show" switch. Written by the server.
alter table public.feedback add column if not exists score smallint check (score is null or score between 1 and 10);
alter table public.feedback add column if not exists public_ok boolean not null default false;
alter table public.feedback add column if not exists display_name text check (display_name is null or char_length(display_name) <= 40);
alter table public.feedback add column if not exists host_hidden boolean not null default false;
create index if not exists feedback_public_reviews_idx on public.feedback(property_id, created_at desc) where kind = 'guest_review' and public_ok;
