-- Room words a host has replaced (resetRoomWords): never given to any room
-- again, so an old card can't open someone else's room later. Server only.
create table if not exists public.retired_room_words (
  words text primary key check (words ~ '^[a-z]{3,11}-[a-z]{3,11}-[a-z]{3,11}$'),
  retired_at timestamptz not null default now()
);
alter table public.retired_room_words enable row level security;
grant all on public.retired_room_words to service_role;
