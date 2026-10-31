-- Live camera view between a door tablet and its host, directly (WebRTC,
-- src/lib/cam-p2p.ts): a random private channel name for setting up the
-- connection, made when the host starts watching and cleared when they stop.
-- Only the signed-in host (watch request) and the tablet (its own token) learn
-- it. The video itself never passes through Latchkey. Additive.
alter table public.kiosk_devices add column if not exists cam_channel text check (cam_channel is null or cam_channel ~ '^[0-9a-f]{32}$');
