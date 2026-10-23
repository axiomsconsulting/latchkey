-- A guest's full phone number, in international (E.164) form, when the host
-- adds it. phone_last4 stays: it's what guests confirm at check-in, and it's
-- filled from the full number. Cleared with the guest's other details by the
-- privacy clean-up.
alter table public.bookings add column if not exists guest_phone text check (guest_phone is null or guest_phone ~ '^\+[1-9][0-9]{6,14}$');
