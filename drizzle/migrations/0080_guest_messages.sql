-- Welcome and goodbye messages to guests by text, WhatsApp and email (src/lib/guest-messages.ts).
-- properties.guest_messages: each property's choices (null = off). bookings.welcome_message_at /
-- goodbye_message_at: when each was sent (claimed before sending, so it's never sent twice).
-- hosts.whatsapp: the business's own WhatsApp number once Latchkey support has connected it
-- ({status, sender, ...}); only the server and super admins change it. Additive.
alter table public.properties add column if not exists guest_messages jsonb;
alter table public.bookings add column if not exists welcome_message_at timestamptz;
alter table public.bookings add column if not exists goodbye_message_at timestamptz;
alter table public.hosts add column if not exists whatsapp jsonb;

create or replace function public.protect_admin_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;
  new.integration_modes := old.integration_modes;
  new.whatsapp := old.whatsapp;
  return new;
end $$;
