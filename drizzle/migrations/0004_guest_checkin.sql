ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS checkin_methods jsonb NOT NULL DEFAULT '{"order":["photo_id","last4","self_declare"],"enabled":{"photo_id":true,"last4":true,"self_declare":true}}'::jsonb;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS id_check_status text,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
COMMENT ON COLUMN public.bookings.id_check_status IS 'matched | partial | not_matched | last4 | self_declared. Result only, never the ID image.';

ALTER TABLE public.check_in_attempts ADD COLUMN IF NOT EXISTS device_hash text;
CREATE INDEX IF NOT EXISTS check_in_attempts_device_idx ON public.check_in_attempts(property_id, device_hash, created_at DESC);

CREATE TABLE public.checkin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  confirmed boolean NOT NULL DEFAULT false,
  verified_method text,
  photo_attempts integer NOT NULL DEFAULT 0,
  last4_attempts integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.checkin_sessions TO service_role;
ALTER TABLE public.checkin_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkin_sessions_staff_read" ON public.checkin_sessions FOR SELECT TO authenticated
  USING (public.is_host_staff(public.property_host_id(property_id)));
GRANT SELECT ON public.checkin_sessions TO authenticated;

CREATE TABLE public.stay_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stay_tokens TO service_role;
ALTER TABLE public.stay_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stay_tokens_no_client" ON public.stay_tokens FOR SELECT TO authenticated USING (false);

CREATE TABLE public.host_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  kind text NOT NULL,
  message text NOT NULL,
  emailed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.host_alerts TO authenticated;
GRANT ALL ON public.host_alerts TO service_role;
ALTER TABLE public.host_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "host_alerts_staff_read" ON public.host_alerts FOR SELECT TO authenticated USING (public.is_host_staff(host_id));
CREATE POLICY "host_alerts_staff_update" ON public.host_alerts FOR UPDATE TO authenticated USING (public.is_host_staff(host_id)) WITH CHECK (public.is_host_staff(host_id));
CREATE INDEX host_alerts_host_idx ON public.host_alerts(host_id, created_at DESC);