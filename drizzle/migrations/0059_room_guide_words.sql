-- Room QR codes as three everyday words ("amber-otter-harbour", src/lib/room-words.ts),
-- unique across every room of every property and host. The older random
-- codes (guide_code) stay, so cards already printed keep working.
alter table public.rooms add column if not exists guide_words text check (guide_words is null or guide_words ~ '^[a-z]{3,11}-[a-z]{3,11}-[a-z]{3,11}$');
create unique index if not exists rooms_guide_words_key on public.rooms(guide_words);
