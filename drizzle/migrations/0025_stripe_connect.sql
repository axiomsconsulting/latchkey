-- Each host takes guest card payments in their own Stripe account, linked
-- through Stripe Connect. Latchkey's own Stripe account (the platform's)
-- only collects subscriptions, plus guest payments for businesses the super
-- admin runs, until they connect an account of their own.

alter table public.hosts
  add column if not exists stripe_account_id text check (stripe_account_id is null or stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  add column if not exists stripe_account_ready boolean not null default false,
  add column if not exists stripe_account_checked_at timestamptz,
  add column if not exists uses_platform_stripe boolean not null default false;

-- Which Stripe account took each card payment, to look it up afterwards.
alter table public.requests add column if not exists stripe_account_id text;

-- The super admin's own businesses keep taking payments as they do today.
update public.hosts h set uses_platform_stripe = true
where exists (
  select 1 from public.host_members m
  join auth.users u on u.id = m.user_id
  join public.super_admins s on s.email = lower(u.email)
  where m.host_id = h.id and m.role::text = 'owner'
);

-- Only Latchkey's server links a Stripe account, after Stripe confirms it.
create or replace function public.protect_billing_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;
  new.subscription_status := old.subscription_status;
  new.trial_started_at := old.trial_started_at;
  new.trial_ends_at := old.trial_ends_at;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.current_period_end := old.current_period_end;
  new.canceled_at := old.canceled_at;
  new.stripe_account_id := old.stripe_account_id;
  new.stripe_account_ready := old.stripe_account_ready;
  new.stripe_account_checked_at := old.stripe_account_checked_at;
  new.uses_platform_stripe := old.uses_platform_stripe;
  -- Support access is the owner's to give, and never for more than 30 days.
  if new.support_access_until is not null and new.support_access_until > now() + interval '30 days 1 minute' then
    new.support_access_until := now() + interval '30 days';
  end if;
  return new;
end $$;
