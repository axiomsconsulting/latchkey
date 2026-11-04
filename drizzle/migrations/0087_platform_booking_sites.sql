-- The built-in booking sites' names, logos and web address rules belong to Latchkey
-- (site_settings.booking_sites, a jsonb object by site id: {label, icon_url, domains}), not
-- each host. Hosts keep the extra sites they add. Logos hosts already uploaded for a built-in
-- site are carried across, oldest business first, so nothing disappears. Additive.

alter table public.site_settings add column if not exists booking_sites jsonb not null default '{}'::jsonb;

do $$
declare
  r record;
begin
  for r in
    select s->>'key' as key, s->>'icon_url' as icon
    from public.hosts h, jsonb_array_elements(h.booking_sites) s
    where jsonb_typeof(h.booking_sites) = 'array'
      and s->>'key' in ('airbnb', 'booking_com', 'homestay', 'vrbo', 'agoda', 'direct', 'other')
      and coalesce(s->>'icon_url', '') <> ''
      and not h.business_name ilike '%(demo)%'
    order by h.created_at
  loop
    update public.site_settings
      set booking_sites = jsonb_set(booking_sites, array[r.key], jsonb_build_object('icon_url', r.icon))
      where id = 1 and not booking_sites ? r.key;
  end loop;
end $$;
