-- Repeating services (the weekly cleaning and other regular visits, stored as weekly
-- unavailability_windows) can name who comes: one of the host's own contacts. Additive.

alter table public.unavailability_windows
  add column if not exists trade_id uuid references public.trades(id) on delete set null;
