-- Commission Partner programme (agreement draft v0.5): partners, effective-dated
-- commission terms snapshotted onto each referral, an add-only commission ledger,
-- the once-per-host Launch Bonus register, payouts, clawbacks, fraud flags and
-- the Stripe event store that makes webhooks idempotent. Money is in pence (GBP).
--
-- Written to be safe to run more than once. Nothing here touches the host
-- subscription or guest payment tables. Partners read only their own rows;
-- identity hashes and the bonus register are server-only (service role).

-- The super admin's programme settings (src/lib/partner-config.ts); read only on the server.
alter table public.site_settings add column if not exists commission_partner_programme jsonb;

-- ------------------------------------------------------------------ partners
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null default 'individual' check (kind in ('individual', 'business')),
  legal_name text not null,
  business_name text,
  business_type text,
  company_number text,
  country char(2) not null,
  email text not null,
  phone_e164 text,
  vat_number text,
  tax_ack_at timestamptz,
  independent_ack_at timestamptz,
  referral_code text,
  status text not null default 'applied' check (status in ('applied', 'pending_review', 'active', 'waitlisted', 'suspended', 'terminated')),
  payout_route text not null default 'none' check (payout_route in ('express', 'global_payouts', 'manual', 'none')),
  stripe_account_id text,
  stripe_account_mode text check (stripe_account_mode in ('test', 'live')),
  payouts_enabled boolean not null default false,
  stripe_requirements jsonb,
  gp_recipient_id text,
  gp_payout_method_id text,
  agreement_version text,
  agreement_accepted_at timestamptz,
  founding_designated_at timestamptz,
  id_check_status text,
  terminated_at timestamptz,
  terminated_by uuid,
  termination_reason text,
  termination_for_breach boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists partners_user_idx on public.partners (user_id);
create unique index if not exists partners_code_idx on public.partners (lower(referral_code)) where referral_code is not null;
create unique index if not exists partners_stripe_idx on public.partners (stripe_account_id) where stripe_account_id is not null;

-- --------------------------------------------------------- commission_terms
create table if not exists public.commission_terms (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  -- null = the whole programme; set = one partner's own terms (clause 7.3).
  partner_id uuid references public.partners(id) on delete cascade,
  effective_from timestamptz not null,
  rate_bps int not null check (rate_bps between 0 and 10000),
  paid_months_cap int not null check (paid_months_cap between 1 and 120),
  -- Blank amount or end date = no Launch Bonus (6.4).
  bonus_amount_pence int check (bonus_amount_pence is null or bonus_amount_pence >= 0),
  bonus_tiers jsonb,
  bonus_end_date date,
  bonus_first_payment_deadline_days int not null default 60 check (bonus_first_payment_deadline_days between 1 and 366),
  -- 6.5: an increase reaches hosts already referred only when OMS says so in writing.
  applies_to_existing boolean not null default false,
  written_notice_ref text,
  notice_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (not applies_to_existing or written_notice_ref is not null)
);
create unique index if not exists commission_terms_label_idx on public.commission_terms (label);

-- Terms that have taken effect can't have their money or dates changed: a change is a new row.
create or replace function public.commission_terms_lock() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.effective_from <= now() then raise exception 'Commission terms that have taken effect can''t be deleted'; end if;
    return old;
  end if;
  if old.effective_from <= now() and (
    new.rate_bps is distinct from old.rate_bps or new.paid_months_cap is distinct from old.paid_months_cap
    or new.bonus_amount_pence is distinct from old.bonus_amount_pence or new.bonus_tiers is distinct from old.bonus_tiers
    or new.bonus_end_date is distinct from old.bonus_end_date or new.effective_from is distinct from old.effective_from
    or new.bonus_first_payment_deadline_days is distinct from old.bonus_first_payment_deadline_days
    or new.partner_id is distinct from old.partner_id
  ) then
    raise exception 'Commission terms that have taken effect can''t be changed: add new terms instead';
  end if;
  return new;
end $$;
drop trigger if exists commission_terms_lock on public.commission_terms;
create trigger commission_terms_lock before update or delete on public.commission_terms for each row execute function public.commission_terms_lock();

-- The launch terms. TODO(D14, D16, launch date): no bonus until Swapnil adds terms with an amount and end date.
insert into public.commission_terms (label, effective_from, rate_bps, paid_months_cap, bonus_amount_pence, bonus_tiers, bonus_end_date)
values ('v0.5-launch', '2026-10-26T00:00:00Z', 1000, 12, null, null, null)
on conflict (label) do nothing;

-- ------------------------------------------------------------ identity keys
-- HMAC-SHA256 (PARTNER_IDENTITY_HASH_SECRET) of normalised values; never the values themselves.
create table if not exists public.partner_identity_keys (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  kind text not null check (kind in ('email', 'email_domain', 'phone', 'legal_name', 'business_name', 'company_number', 'card_fingerprint', 'bank_fingerprint', 'ip_hash', 'device_hash')),
  value_hash text not null,
  seen_at timestamptz not null default now(),
  unique (partner_id, kind, value_hash)
);
create index if not exists partner_identity_keys_lookup on public.partner_identity_keys (kind, value_hash);

create table if not exists public.host_identity_keys (
  id bigint generated always as identity primary key,
  host_id uuid not null references public.hosts(id) on delete cascade,
  kind text not null check (kind in ('email', 'email_domain', 'phone', 'legal_name', 'business_name', 'company_number', 'card_fingerprint', 'bank_fingerprint', 'ip_hash', 'device_hash', 'property_address', 'listing_url', 'business_postcode')),
  value_hash text not null,
  seen_at timestamptz not null default now(),
  unique (host_id, kind, value_hash)
);
create index if not exists host_identity_keys_lookup on public.host_identity_keys (kind, value_hash);

-- -------------------------------------------------------- clicks, referrals
create table if not exists public.referral_clicks (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  code text not null,
  clicked_at timestamptz not null default now(),
  device_hash text,
  ip_hash text,
  landing_path text
);
create index if not exists referral_clicks_partner on public.referral_clicks (partner_id, clicked_at desc);
create index if not exists referral_clicks_device on public.referral_clicks (device_hash, clicked_at desc);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  -- One Commission Partner per business. Kept (host_id null) if the business is deleted, for the ledger.
  host_id uuid unique references public.hosts(id) on delete set null,
  partner_id uuid not null references public.partners(id) on delete restrict,
  owner_user_id uuid,
  source text not null check (source in ('link', 'cookie', 'typed', 'admin')),
  clicked_at timestamptz,
  -- The Sign-up Date (clause 3): when the business was created, i.e. hosts.created_at.
  sign_up_at timestamptz not null,
  attributed_at timestamptz not null default now(),
  terms_id uuid references public.commission_terms(id),
  terms_snapshot jsonb not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  reject_reason text,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  locked_at timestamptz,
  flags jsonb not null default '[]'::jsonb,
  -- The Qualifying Payment (clause 3).
  qualifying_invoice_id text,
  qualifying_charge_id text,
  qualifying_payment_at timestamptz,
  billing_interval text check (billing_interval in ('month', 'year')),
  first_paid_month_end timestamptz,
  paid_months_used int not null default 0 check (paid_months_used between 0 and 12),
  -- End of the last paid billing period, to spot a missed month after the partner stops (11.2(a)).
  last_paid_period_end timestamptz,
  -- Refunds and lost disputes recorded against the Qualifying Payment's charge (6.7(b)).
  qp_refunded_pence int not null default 0,
  qp_dispute text check (qp_dispute in ('open', 'won', 'lost')),
  status_detail text not null default 'trial' check (status_detail in ('trial', 'paying', 'paused', 'cap_reached', 'ended')),
  bonus_status text not null default 'pending' check (bonus_status in ('not_eligible', 'pending', 'earned', 'withheld', 'reversed', 'paid')),
  bonus_ineligible_reason text,
  post_stop_gap_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  host_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists referrals_partner on public.referrals (partner_id, created_at desc);
create index if not exists referrals_qp_charge on public.referrals (qualifying_charge_id) where qualifying_charge_id is not null;

-- ------------------------------------------------------------ stripe_events
create table if not exists public.stripe_events (
  event_id text primary key,
  type text not null,
  livemode boolean not null default false,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  result text,
  error text
);

-- Each referred host's payment, so refunds and disputes find their referral and
-- only the newly refunded amount is clawed back (Stripe reports the running total).
create table if not exists public.partner_charges (
  charge_id text primary key,
  referral_id uuid not null references public.referrals(id) on delete restrict,
  invoice_id text,
  amount_pence int not null,
  refunded_pence int not null default 0,
  dispute_status text check (dispute_status in ('open', 'won', 'lost')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- commission_ledger
create table if not exists public.commission_ledger (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  referral_id uuid references public.referrals(id) on delete restrict,
  host_id uuid,
  source_event_id text,
  stripe_invoice_id text,
  stripe_charge_id text,
  period_start timestamptz,
  period_end timestamptz,
  paid_month_from int,
  paid_month_to int,
  months_covered int,
  base_pence int not null default 0,
  rate_bps int,
  amount_pence int not null,
  kind text not null check (kind in ('commission', 'launch_bonus', 'clawback', 'dispute_hold', 'dispute_release', 'adjustment', 'write_off')),
  state text not null default 'held' check (state in ('held', 'on_hold', 'payable', 'paid', 'void')),
  payable_after timestamptz,
  payout_id uuid,
  reverses_ledger_id uuid references public.commission_ledger(id),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (kind <> 'commission' or (
    paid_month_from is not null and paid_month_to is not null and months_covered is not null
    and 1 <= paid_month_from and paid_month_from <= paid_month_to and paid_month_to <= 12
    and months_covered = paid_month_to - paid_month_from + 1
  ))
);
create unique index if not exists commission_ledger_one_per_invoice on public.commission_ledger (stripe_invoice_id) where kind = 'commission';
create unique index if not exists commission_ledger_one_bonus on public.commission_ledger (referral_id) where kind = 'launch_bonus';
create index if not exists commission_ledger_partner on public.commission_ledger (partner_id, state);
-- A retried webhook can't add the same clawback or dispute marker twice.
create unique index if not exists commission_ledger_one_clawback_per_event on public.commission_ledger (reverses_ledger_id, source_event_id) where kind = 'clawback' and source_event_id is not null;
create unique index if not exists commission_ledger_one_marker_per_event on public.commission_ledger (stripe_charge_id, kind, source_event_id) where kind in ('dispute_hold', 'dispute_release') and source_event_id is not null;
create index if not exists commission_ledger_charge on public.commission_ledger (stripe_charge_id) where stripe_charge_id is not null;

-- Add-only: corrections are new rows. Only state, payable_after and payout_id may change; nothing is deleted.
create or replace function public.commission_ledger_lock() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Commission ledger lines can''t be deleted'; end if;
  if (new.partner_id, new.referral_id, new.host_id, new.source_event_id, new.stripe_invoice_id, new.stripe_charge_id,
      new.period_start, new.period_end, new.paid_month_from, new.paid_month_to, new.months_covered, new.base_pence,
      new.rate_bps, new.amount_pence, new.kind, new.reverses_ledger_id, new.created_at)
     is distinct from
     (old.partner_id, old.referral_id, old.host_id, old.source_event_id, old.stripe_invoice_id, old.stripe_charge_id,
      old.period_start, old.period_end, old.paid_month_from, old.paid_month_to, old.months_covered, old.base_pence,
      old.rate_bps, old.amount_pence, old.kind, old.reverses_ledger_id, old.created_at) then
    raise exception 'Commission ledger amounts can''t be changed: add a correcting line instead';
  end if;
  return new;
end $$;
drop trigger if exists commission_ledger_lock on public.commission_ledger;
create trigger commission_ledger_lock before update or delete on public.commission_ledger for each row execute function public.commission_ledger_lock();

-- ------------------------------------------------------ launch_bonus_claims
-- Once per Referred Host ever (6.4), across every partner and all time, reversed claims included.
create table if not exists public.launch_bonus_claims (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.referrals(id) on delete restrict,
  host_id uuid,
  ledger_id uuid references public.commission_ledger(id),
  identity_hashes text[] not null default '{}',
  status text not null default 'earned' check (status in ('earned', 'withheld', 'reversed', 'paid')),
  created_at timestamptz not null default now()
);
create index if not exists launch_bonus_claims_hashes on public.launch_bonus_claims using gin (identity_hashes);

-- ------------------------------------------------------------------ payouts
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  route text not null check (route in ('express', 'global_payouts', 'manual')),
  amount_pence int not null check (amount_pence > 0),
  currency text not null default 'gbp',
  est_fee_pence int,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sending', 'sent', 'failed', 'reversed', 'manual_pending', 'manual_done', 'cancelled')),
  stripe_transfer_id text,
  gp_outbound_payment_id text,
  manual_reference text,
  idempotency_key text not null unique,
  due_by date,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  failure text,
  mode text not null default 'test' check (mode in ('test', 'live')),
  created_at timestamptz not null default now()
);
create index if not exists payouts_partner on public.payouts (partner_id, created_at desc);

create table if not exists public.payout_items (
  payout_id uuid not null references public.payouts(id) on delete cascade,
  ledger_id uuid not null unique references public.commission_ledger(id),
  primary key (payout_id, ledger_id)
);

-- ---------------------------------------------------------------- clawbacks
create table if not exists public.clawbacks (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  ledger_id uuid references public.commission_ledger(id),
  cause text not null check (cause in ('refund', 'chargeback', 'reversed_payment', 'fraud', 'admin')),
  amount_pence int not null check (amount_pence >= 0),
  method text not null default 'offset' check (method in ('offset', 'reversal')),
  stripe_reversal_id text,
  recovered_pence int not null default 0,
  status text not null default 'open' check (status in ('open', 'offset', 'reversed', 'repayment_requested', 'written_off', 'closed')),
  repayment_requested_at timestamptz,
  source_event_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists clawbacks_one_per_event on public.clawbacks (ledger_id, source_event_id) where source_event_id is not null;
create index if not exists clawbacks_partner on public.clawbacks (partner_id, status);

-- ---------------------------------------------------- audit and fraud flags
create table if not exists public.partner_events (
  id bigint generated always as identity primary key,
  partner_id uuid references public.partners(id) on delete set null,
  referral_id uuid references public.referrals(id) on delete set null,
  actor uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists partner_events_partner on public.partner_events (partner_id, created_at desc);

create table if not exists public.fraud_flags (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid references public.referrals(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete cascade,
  kind text not null check (kind in ('self_referral', 'prior_host', 'bonus_dedupe', 'fake_host', 'trial_cycling', 'burst', 'dispute_rate', 'shared_card', 'shared_device', 'shared_ip', 'other_interval')),
  strength text not null check (strength in ('strong', 'weak')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists fraud_flags_open on public.fraud_flags (status, created_at desc);

-- ------------------------------------------------------------------ balances
-- held / on hold / payable / paid, and what's owed back (negative lines not yet offset), in pence.
create or replace function public.partner_balance(_partner_id uuid)
returns table (held_pence bigint, on_hold_pence bigint, payable_pence bigint, paid_pence bigint, negative_pence bigint)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(amount_pence) filter (where state = 'held' and amount_pence > 0), 0),
    coalesce(sum(amount_pence) filter (where state = 'on_hold' and amount_pence > 0), 0),
    coalesce(sum(amount_pence) filter (where state = 'payable' and amount_pence > 0), 0),
    coalesce(sum(amount_pence) filter (where state = 'paid'), 0),
    coalesce(-sum(amount_pence) filter (where state = 'payable' and amount_pence < 0), 0)
  from public.commission_ledger
  where partner_id = _partner_id
    and (public.is_super_admin() or exists (select 1 from public.partners p where p.id = _partner_id and p.user_id = auth.uid()))
$$;

-- A partner's own referrals, with the business shown only as initials and town.
create or replace function public.my_partner_referrals()
returns table (id uuid, host_label text, status text, status_detail text, paid_months_used int, bonus_status text, bonus_ineligible_reason text, sign_up_at timestamptz, terms_snapshot jsonb)
language sql stable security definer set search_path = public as $$
  select r.id, r.host_label, r.status, r.status_detail, r.paid_months_used, r.bonus_status, r.bonus_ineligible_reason, r.sign_up_at, r.terms_snapshot
  from public.referrals r join public.partners p on p.id = r.partner_id
  where p.user_id = auth.uid()
  order by r.sign_up_at desc
$$;
grant execute on function public.partner_balance(uuid) to authenticated;
grant execute on function public.my_partner_referrals() to authenticated;

-- ---------------------------------------------------------------------- RLS
alter table public.partners enable row level security;
alter table public.commission_terms enable row level security;
alter table public.partner_identity_keys enable row level security;
alter table public.host_identity_keys enable row level security;
alter table public.referral_clicks enable row level security;
alter table public.referrals enable row level security;
alter table public.stripe_events enable row level security;
alter table public.partner_charges enable row level security;
alter table public.commission_ledger enable row level security;
alter table public.launch_bonus_claims enable row level security;
alter table public.payouts enable row level security;
alter table public.payout_items enable row level security;
alter table public.clawbacks enable row level security;
alter table public.partner_events enable row level security;
alter table public.fraud_flags enable row level security;

-- Super admins: everything visible and editable (except the server-only tables below).
drop policy if exists partners_admin on public.partners;
create policy partners_admin on public.partners for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists partners_self_read on public.partners;
create policy partners_self_read on public.partners for select to authenticated using (user_id = auth.uid());

drop policy if exists commission_terms_admin on public.commission_terms;
create policy commission_terms_admin on public.commission_terms for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists referral_clicks_admin on public.referral_clicks;
create policy referral_clicks_admin on public.referral_clicks for select to authenticated using (public.is_super_admin());

-- Referral rows themselves: admins only; partners use my_partner_referrals() (no host ids).
drop policy if exists referrals_admin on public.referrals;
create policy referrals_admin on public.referrals for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists stripe_events_admin on public.stripe_events;
create policy stripe_events_admin on public.stripe_events for select to authenticated using (public.is_super_admin());

drop policy if exists partner_charges_admin on public.partner_charges;
create policy partner_charges_admin on public.partner_charges for select to authenticated using (public.is_super_admin());

drop policy if exists commission_ledger_admin on public.commission_ledger;
create policy commission_ledger_admin on public.commission_ledger for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists commission_ledger_self on public.commission_ledger;
create policy commission_ledger_self on public.commission_ledger for select to authenticated
  using (exists (select 1 from public.partners p where p.id = partner_id and p.user_id = auth.uid()));

drop policy if exists payouts_admin on public.payouts;
create policy payouts_admin on public.payouts for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists payouts_self on public.payouts;
create policy payouts_self on public.payouts for select to authenticated
  using (exists (select 1 from public.partners p where p.id = partner_id and p.user_id = auth.uid()));

drop policy if exists payout_items_admin on public.payout_items;
create policy payout_items_admin on public.payout_items for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists clawbacks_admin on public.clawbacks;
create policy clawbacks_admin on public.clawbacks for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists clawbacks_self on public.clawbacks;
create policy clawbacks_self on public.clawbacks for select to authenticated
  using (exists (select 1 from public.partners p where p.id = partner_id and p.user_id = auth.uid()));

drop policy if exists partner_events_admin on public.partner_events;
create policy partner_events_admin on public.partner_events for select to authenticated using (public.is_super_admin());

drop policy if exists fraud_flags_admin on public.fraud_flags;
create policy fraud_flags_admin on public.fraud_flags for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- partner_identity_keys, host_identity_keys and launch_bonus_claims have no
-- policies at all: only the server (service role) reads or writes them.
