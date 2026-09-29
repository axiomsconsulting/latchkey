-- Host can pin guide sections to the "things people usually forget" card
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- Amenities already provided in a room, shown to guests so they don't request them
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS amenities jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Host-editable display labels for booking channels; internal ids never change
ALTER TABLE public.hosts ADD COLUMN IF NOT EXISTS channel_labels jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Payment route and receipt details for extras requests
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS receipt_number text;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS receipt_emailed_at timestamptz;
