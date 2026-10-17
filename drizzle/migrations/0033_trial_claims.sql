-- Free trial → Google or Apple. The trial runs on an anonymous account; a
-- social sign-in lands in a different (new or existing) account. Before
-- leaving for Google/Apple, the trial makes a one-time claim here, and the
-- account that comes back takes over the trial's business with it.
create table if not exists public.trial_claims (
  code_hash text primary key check (char_length(code_hash) = 64),
  anon_user_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid
);
alter table public.trial_claims enable row level security;
grant all on public.trial_claims to service_role;
