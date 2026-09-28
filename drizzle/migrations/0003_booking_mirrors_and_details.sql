ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS mirror_of uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_url text,
  ADD COLUMN IF NOT EXISTS listing_title text,
  ADD COLUMN IF NOT EXISTS feed_status text;
CREATE INDEX IF NOT EXISTS bookings_room_dates_idx ON public.bookings(room_id, check_in_date, check_out_date);
COMMENT ON COLUMN public.bookings.mirror_of IS 'Set when this calendar entry is another platform echoing a real booking on the same room.';