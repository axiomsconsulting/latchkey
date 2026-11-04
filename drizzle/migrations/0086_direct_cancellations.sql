-- Cancelling a direct stay: who did it, when, and what happened to the money.
-- refund_status: none (nothing to give back), done (refunded by card through
-- Stripe, or the host says they've paid it back), to_do (a bank or cash refund the
-- host still has to make). Additive.

alter table public.direct_reservations add column if not exists cancelled_at timestamptz;
alter table public.direct_reservations add column if not exists cancelled_by text check (cancelled_by is null or cancelled_by in ('guest', 'host'));
alter table public.direct_reservations add column if not exists refund_pence int check (refund_pence is null or refund_pence >= 0);
alter table public.direct_reservations add column if not exists refund_status text check (refund_status is null or refund_status in ('none', 'done', 'to_do'));
alter table public.direct_reservations add column if not exists stripe_refund_id text;
