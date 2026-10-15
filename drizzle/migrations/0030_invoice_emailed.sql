-- When an invoice was last emailed to the guest, and to which address.
alter table public.invoices
  add column if not exists emailed_at timestamptz,
  add column if not exists emailed_to text check (emailed_to is null or char_length(emailed_to) <= 254);

-- The guest's postal address, if the host has it; printed under their name on invoices.
alter table public.bookings
  add column if not exists guest_address text check (guest_address is null or char_length(guest_address) <= 400);
