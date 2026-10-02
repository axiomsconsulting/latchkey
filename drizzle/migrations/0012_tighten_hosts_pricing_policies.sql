DROP POLICY IF EXISTS "hosts_insert" ON public.hosts;
DROP POLICY IF EXISTS "Pricing is public" ON public.platform_pricing;
CREATE POLICY "Pricing is public" ON public.platform_pricing FOR SELECT TO anon, authenticated USING (id = 1);