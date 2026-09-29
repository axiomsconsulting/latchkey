ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS theme_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.hosts ADD COLUMN IF NOT EXISTS integration_modes jsonb NOT NULL DEFAULT '{"contra":"demo","id_check":"live","host_email":"demo","guest_messages":"demo"}'::jsonb;

CREATE TABLE public.service_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'guest' CHECK (source IN ('guest','host','maintenance')),
  category text NOT NULL,
  title text NOT NULL,
  note text,
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','urgent')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','acknowledged','booked','in_progress','done','declined','cancelled')),
  guest_price_pence integer,
  scheduled_at timestamptz,
  provider jsonb,
  provider_mode text CHECK (provider_mode IN ('demo','live')),
  provider_ref text,
  quoted_pence integer,
  eta_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_jobs_host_idx ON public.service_jobs(host_id, status);
CREATE INDEX service_jobs_booking_idx ON public.service_jobs(booking_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_jobs TO authenticated;
GRANT ALL ON public.service_jobs TO service_role;
ALTER TABLE public.service_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_jobs_staff ON public.service_jobs FOR ALL TO authenticated
  USING (public.is_host_staff(host_id)) WITH CHECK (public.is_host_staff(host_id));

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.service_jobs(id) ON DELETE SET NULL;
