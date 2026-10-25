-- Latchkey-wide settings are read only by super admins (Lovable's security
-- fix, 0021_site_settings_admin_read). That file sorts before 0024, which
-- created site_settings with an everyone-can-read policy, so a database built
-- by running the files in order would end up readable again. Re-applied here,
-- after everything, so the result is the same either way. The app reads these
-- settings on the server only (service role), never as the signed-in user.
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to authenticated using (public.is_super_admin());
revoke select on public.site_settings from anon;
