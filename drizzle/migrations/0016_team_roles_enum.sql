-- Team roles. Kept on their own: a new enum value can't be used in the same
-- transaction that adds it. Later migrations compare role::text, so they work
-- however the runner batches them.
alter type public.host_role add value if not exists 'manager';
alter type public.host_role add value if not exists 'viewer';
