-- Door tablets: three levels instead of compatibility on/off (src/lib/kiosk-compat.ts).
-- kiosk_mode: the host's choice, lite / enhanced / full (null = follow what the tablet detected);
-- mode_detected: the richest level the tablet's browser can run;
-- full_failed_at: the full kiosk was tried there and didn't start, so it went back to enhanced.
-- The older compat column stays in step for tablets still on older versions. Additive.
alter table public.kiosk_devices add column if not exists kiosk_mode text
  check (kiosk_mode is null or kiosk_mode in ('lite', 'enhanced', 'full'));
alter table public.kiosk_devices add column if not exists mode_detected text
  check (mode_detected is null or mode_detected in ('lite', 'enhanced', 'full'));
alter table public.kiosk_devices add column if not exists full_failed_at timestamptz;
