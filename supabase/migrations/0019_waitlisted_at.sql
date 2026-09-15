-- Waitlist queue is first-come first-served by join time, not roster add time.
-- Every active player is auto-added to new bookings, so created_at is the
-- roster timestamp and is the wrong FIFO key.

alter table booking_attendance
  add column if not exists waitlisted_at timestamptz;

create index if not exists idx_attendance_waitlist_order
  on booking_attendance (booking_id, waitlisted_at)
  where response_status = 'waitlist';

-- Current waitlisted rows: updated_at is the RSVP change to waitlist.
update booking_attendance
  set waitlisted_at = updated_at
  where response_status = 'waitlist'
    and waitlisted_at is null;
