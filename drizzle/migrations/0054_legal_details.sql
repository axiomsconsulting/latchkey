-- The operator's legal details for the Terms of service and Privacy policy
-- pages (company name and number, address, contact and privacy emails, ICO
-- registration, VAT number, governing law). Super admin edits them in
-- Latchkey admin → Site settings → Legal details; the public pages read them.
alter table public.site_settings add column if not exists legal jsonb not null default '{}'::jsonb;
