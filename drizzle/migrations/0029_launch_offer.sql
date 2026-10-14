-- Launch offer: hosts who open an account while a campaign runs pay the
-- offer price for their first paid month (after the free trial), then the
-- standard price. The super admin sets the campaign in Latchkey admin →
-- Pricing studio; it's stored in site_settings.offer.

alter table public.site_settings add column if not exists offer jsonb;
update public.site_settings
  set offer = '{"enabled": true, "pricePence": 100, "label": "Launch offer", "startsOn": "2026-10-14", "endsOn": "2026-12-31"}'::jsonb
  where id = 1 and offer is null;

-- Locked in when the account is opened; used once the first paid month starts.
alter table public.hosts
  add column if not exists offer_pence integer check (offer_pence is null or offer_pence between 0 and 100000),
  add column if not exists offer_label text check (offer_label is null or char_length(offer_label) <= 60),
  add column if not exists offer_used_at timestamptz;

-- The running campaign, or null. Dates are UK days, both inclusive.
create or replace function public.current_offer()
returns jsonb language sql stable security definer set search_path = public as $$
  select s.offer from public.site_settings s
  where s.id = 1
    and coalesce((s.offer ->> 'enabled')::boolean, false)
    and (s.offer ->> 'pricePence') ~ '^[0-9]+$'
    and (now() at time zone 'Europe/London')::date
        between coalesce(nullif(s.offer ->> 'startsOn', '')::date, '-infinity'::date)
            and coalesce(nullif(s.offer ->> 'endsOn', '')::date, 'infinity'::date)
$$;
grant execute on function public.current_offer() to anon, authenticated, service_role;

create or replace function public.lock_in_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb := public.current_offer();
begin
  if o is not null then
    new.offer_pence := (o ->> 'pricePence')::integer;
    new.offer_label := left(coalesce(o ->> 'label', 'Launch offer'), 60);
  else
    new.offer_pence := null;
    new.offer_label := null;
  end if;
  new.offer_used_at := null;
  return new;
end $$;
drop trigger if exists lock_in_offer on public.hosts;
create trigger lock_in_offer before insert on public.hosts for each row execute function public.lock_in_offer();

-- The offer is a billing field: only Latchkey's server or the super admin sets it.
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
  new.plan_key := old.plan_key;
  new.api_addon := old.api_addon;
  new.offer_pence := old.offer_pence;
  new.offer_label := old.offer_label;
  new.offer_used_at := old.offer_used_at;
  if new.support_access_until is not null and new.support_access_until > now() + interval '30 days 1 minute' then
    new.support_access_until := now() + interval '30 days';
  end if;
  return new;
end $$;
