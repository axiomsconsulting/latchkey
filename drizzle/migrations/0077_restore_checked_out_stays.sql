-- Calendar sync used to cancel a stay that dropped off its site's calendar on check-out day,
-- even after the guest had checked out (src/lib/sync-logic.ts bookingsToCancel now leaves
-- stays under way alone). Puts back the stays that were checked out and then cancelled.
-- Touches only rows with a recorded check-out, so it is safe to run more than once.
update public.bookings
   set status = 'checked_out'
 where status = 'cancelled'
   and checked_out_at is not null;
