-- Retire the "Maybe" RSVP option.
-- The player and admin UIs no longer offer "Maybe" (see feat/remove-maybe-rsvp),
-- but legacy rows may still carry it. Convert them to "no_response" and tighten
-- the check constraint so it can never be written again.

update booking_attendance
  set response_status = 'no_response'
  where response_status = 'maybe';

alter table booking_attendance
  drop constraint if exists booking_attendance_response_status_check;

alter table booking_attendance
  add constraint booking_attendance_response_status_check
    check (response_status in ('going','not_going','no_response','waitlist'));
