ALTER TYPE public.booking_channel ADD VALUE IF NOT EXISTS 'vrbo';
ALTER TYPE public.booking_channel ADD VALUE IF NOT EXISTS 'agoda';

ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS host_note text;

ALTER TABLE public.extras_catalogue ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS export_feed_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS feed_token text;

CREATE UNIQUE INDEX IF NOT EXISTS rooms_feed_token_key ON public.rooms (feed_token) WHERE feed_token IS NOT NULL;