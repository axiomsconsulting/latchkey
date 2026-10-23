-- Links to the property's and each room's own listing on the booking sites
-- ([{site, url}], normalised by src/lib/listing-links.ts), from the listing
-- import or typed in by the host; shown as the sites' icons on Properties.
alter table public.properties add column if not exists listing_links jsonb not null default '[]'::jsonb;
alter table public.rooms add column if not exists listing_links jsonb not null default '[]'::jsonb;
