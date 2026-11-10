-- A host's own sample ID and selfie for trying the check-in (TestStayCard): the kiosk, opened from
-- the test card's link, shows them in place of the camera and takes them as a guest's would.
-- One row per property; the files live in the private store (Google Drive), referenced here.
-- Server only (RLS on, no policies). Kept until the host removes them. Additive.
create table if not exists public.test_check_in_samples (
  property_id uuid primary key references public.properties(id) on delete cascade,
  id_ref text,
  face_ref text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.test_check_in_samples enable row level security;
grant all on public.test_check_in_samples to service_role;
