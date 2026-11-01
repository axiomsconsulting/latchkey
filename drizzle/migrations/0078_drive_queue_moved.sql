-- Check-in photos are saved to the private queue first (a quick write while the guest waits) and
-- moved to Google Drive shortly after (src/lib/private-store.server.ts). A moved file's queue row
-- stays for a day with moved_to = its Drive reference, so a link made before the move still opens
-- the file (resolveRef). Additive.
alter table public.drive_queue add column if not exists moved_to text;
alter table public.drive_queue add column if not exists moved_at timestamptz;
create index if not exists drive_queue_waiting on public.drive_queue (created_at) where moved_to is null;
