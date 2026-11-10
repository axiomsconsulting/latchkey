-- Service mode for a host's test check-in on one door tablet: until service_until (10 minutes, or
-- until the host ends it) that tablet's check-in opens the property's test stay straight away;
-- other tablets carry on as usual. A plain column, no foreign key: the test stay is removed
-- with its records on reset. Additive.
alter table public.kiosk_devices add column if not exists service_until timestamptz;
alter table public.kiosk_devices add column if not exists service_booking_id uuid;
