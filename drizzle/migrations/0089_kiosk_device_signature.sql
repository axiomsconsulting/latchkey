-- Door tablets: what kind of device opened the kiosk (operating system family and screen, never a
-- browser), so a second browser on one tablet takes up the same entry rather than adding another.
-- Browsers give web pages no real device identifier. Rules in src/lib/kiosk-devices.ts. Additive.
alter table public.kiosk_devices add column if not exists device_sig text
  check (device_sig is null or char_length(device_sig) <= 60);
create index if not exists kiosk_devices_sig_idx on public.kiosk_devices(property_id, device_sig);
